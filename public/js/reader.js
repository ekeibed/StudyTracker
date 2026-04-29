const Reader = {
  pdfDoc: null,
  currentPage: 1,
  totalPages: 1,
  userZoom: 1.0,
  fitScale: 1.0,
  materialData: null,
  courseId: null,
  materialId: null,
  rendering: false,
  _resizeTimer: null,

  // ── Annotation state ────────────────────────────────────
  activeTool: null,          // 'pen' | 'highlight' | 'eraser' | null
  highlightColor: '#fbbf24', // yellow default
  strokeSize: 4,
  isDrawing: false,
  _currentStroke: null,
  _annotations: {},          // { [pageNum]: [strokes] }
  _bookmarks: [],
  annotCtx: null,
  _offscreen: null,      // reusable offscreen canvas for highlight compositing
  _undoHistory: {},      // { [pageNum]: [ [stroke, ...], ... ] }  max 20 states/page

  async render(courseId, materialId) {
    Reader.courseId   = courseId;
    Reader.materialId = materialId;
    Reader.pdfDoc     = null;
    Reader.currentPage = 1;
    Reader.userZoom   = 1.0;
    Reader.activeTool = null;
    Reader.isDrawing  = false;
    Reader._currentStroke = null;
    Reader._annotations   = {};
    Reader._undoHistory   = {};
    Reader.annotCtx       = null;

    // Load persisted bookmarks
    Reader._bookmarks = JSON.parse(
      localStorage.getItem(`bookmarks_${materialId}`) || '[]'
    );
    // Load all saved annotation pages
    for (const key of Object.keys(localStorage)) {
      const m = key.match(new RegExp(`^annot_${materialId}_p(\\d+)$`));
      if (m) {
        try {
          Reader._annotations[parseInt(m[1])] =
            JSON.parse(localStorage.getItem(key));
        } catch (e) { /* corrupt — skip */ }
      }
    }

    const app = document.getElementById('app');
    app.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
      const res = await api(`/materials/${courseId}/${materialId}`);
      Reader.materialData = res.data;
      const m   = Reader.materialData;
      const pct = Math.round((m.completedPages / m.totalPages) * 100);

      app.innerHTML = `
        <div class="reader-container" id="readerContainer">

          <!-- ── Header ── -->
          <div class="reader-header">
            <div class="reader-header-left">
              <button class="reader-back-btn" id="readerBackBtn" title="Back to course">
                <i class="fas fa-arrow-left"></i>
              </button>
              <div class="reader-header-meta">
                <h2 class="reader-title">${escapeHtml(m.title)}</h2>
                <div class="reader-meta-row">
                  <span class="reader-subtitle" id="readerSubtitle">${m.completedPages}/${m.totalPages} pages completed</span>
                  <div class="reader-progress-track">
                    <div class="reader-progress-fill ${getProgressColor(pct)}" id="readerProgressFill" style="width:${pct}%"></div>
                  </div>
                  <span class="reader-pct" id="readerProgressText">${pct}%</span>
                </div>
              </div>
            </div>

            <div class="reader-toolbar">
              <!-- Navigation -->
              <button class="reader-tool-btn" id="prevPageBtn" disabled title="Previous page (←)">
                <i class="fas fa-chevron-left"></i>
              </button>
              <span class="reader-page-info">
                <span id="currentPageNum">1</span>
                <span class="reader-page-sep">/</span>
                <span id="totalPagesNum">${m.totalPages}</span>
              </span>
              <button class="reader-tool-btn" id="nextPageBtn" title="Next page (→)">
                <i class="fas fa-chevron-right"></i>
              </button>

              <div class="reader-tool-divider"></div>

              <!-- Zoom -->
              <button class="reader-tool-btn" id="zoomOutBtn" title="Zoom out (-)">
                <i class="fas fa-minus"></i>
              </button>
              <span class="reader-zoom-label" id="zoomLevel">Fit</span>
              <button class="reader-tool-btn" id="zoomInBtn" title="Zoom in (+)">
                <i class="fas fa-plus"></i>
              </button>
              <button class="reader-tool-btn reader-fit-btn" id="fitBtn" title="Fit page (0)">
                <i class="fas fa-compress-arrows-alt"></i>
              </button>

              <div class="reader-tool-divider"></div>

              <!-- Mark done -->
              <button class="reader-done-btn" id="markDoneBtn">
                <i class="fas fa-check-circle" id="markDoneIcon"></i>
                <span id="markDoneBtnText">Mark Done</span>
              </button>

              <div class="reader-tool-divider"></div>

              <!-- ── Annotation tools ── -->
              <button class="reader-tool-btn" id="penBtn" title="Pen — draw (P)">
                <i class="fas fa-pen"></i>
              </button>
              <button class="reader-tool-btn" id="highlightBtn" title="Highlighter (H)">
                <i class="fas fa-highlighter"></i>
              </button>
              <!-- Color swatches — shown only when highlighter active -->
              <div class="annot-colors" id="annotColors">
                <div class="annot-color active" data-color="#fbbf24" title="Yellow" style="background:#fbbf24"></div>
                <div class="annot-color" data-color="#4ade80" title="Green"  style="background:#4ade80"></div>
                <div class="annot-color" data-color="#f472b6" title="Pink"   style="background:#f472b6"></div>
              </div>
              <button class="reader-tool-btn" id="eraserBtn" title="Eraser (E)">
                <i class="fas fa-eraser"></i>
              </button>
              <select class="reader-stroke-size" id="strokeSizeSelect" title="Brush size">
                <option value="2">S</option>
                <option value="4" selected>M</option>
                <option value="8">L</option>
              </select>
              <button class="reader-tool-btn" id="undoAnnotBtn" title="Undo last stroke (Ctrl+Z)" disabled>
                <i class="fas fa-undo"></i>
              </button>
              <button class="reader-tool-btn" id="clearAnnotBtn" title="Clear page annotations">
                <i class="fas fa-trash-alt"></i>
              </button>

              <div class="reader-tool-divider"></div>

              <!-- Bookmark -->
              <button class="reader-tool-btn" id="bookmarkBtn" title="Bookmark this page (B)">
                <i class="far fa-bookmark" id="bookmarkIcon"></i>
              </button>
            </div>
          </div>

          <!-- ── Body: sidebar + viewer ── -->
          <div class="reader-body" id="readerBody">

            <!-- Sidebar -->
            <div class="reader-sidebar" id="readerSidebar">
              <div class="sidebar-label">PAGES</div>
              <div class="page-list" id="pageList"></div>
            </div>

            <!-- PDF Viewer -->
            <div class="reader-viewer" id="canvasWrap">
              <div class="reader-page-wrap" id="pageWrap">
                <!-- canvasStack keeps PDF canvas + annotation overlay perfectly aligned -->
                <div id="canvasStack">
                  <canvas id="pdfCanvas"></canvas>
                  <canvas id="annotCanvas"></canvas>
                </div>
                <img id="readerImg" style="display:none" alt="Material">
              </div>
            </div>

          </div>
        </div>
      `;

      Reader.buildPageList(m);

      // ── Set up annotation canvas BEFORE loading PDF ──
      // (renderPage calls replayAnnotations which needs annotCtx to be ready)
      Reader.setupAnnotationCanvas();
      Reader.setupAnnotToolbar();

      // ── Save on page unload (safety net for refresh / tab close) ──
      Reader._unloadHandler = () => Reader.saveAnnotations(Reader.currentPage);
      window.addEventListener('beforeunload', Reader._unloadHandler);

      if (m.fileType === 'application/pdf' && m.fileUrl) {
        await Reader.loadPDF(m.fileUrl, m);
      } else if (m.fileType && m.fileType.startsWith('image/') && m.fileUrl) {
        Reader.loadImage(m.fileUrl, m);
      }

      // ── Core event listeners ──
      document.getElementById('readerBackBtn').onclick = () =>
        (window.location.hash = `#/course/${courseId}`);
      document.getElementById('prevPageBtn').onclick  = () => Reader.goToPage(Reader.currentPage - 1);
      document.getElementById('nextPageBtn').onclick  = () => Reader.goToPage(Reader.currentPage + 1);
      document.getElementById('zoomInBtn').onclick    = () => Reader.adjustZoom(0.2);
      document.getElementById('zoomOutBtn').onclick   = () => Reader.adjustZoom(-0.2);
      document.getElementById('fitBtn').onclick       = () => Reader.resetZoom();
      document.getElementById('markDoneBtn').onclick  = () =>
        Reader.togglePageDone(courseId, materialId, Reader.currentPage);

      // ── Keyboard shortcuts ──
      Reader._keyHandler = (e) => {
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        // Navigation
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') Reader.goToPage(Reader.currentPage + 1);
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   Reader.goToPage(Reader.currentPage - 1);
        // Mark done
        if (e.key === 'd' || e.key === 'D')
          Reader.togglePageDone(courseId, materialId, Reader.currentPage);
        // Zoom
        if (e.key === '0') Reader.resetZoom();
        if (e.key === '+' || e.key === '=') Reader.adjustZoom(0.2);
        if (e.key === '-') Reader.adjustZoom(-0.2);
        // Annotation tools  (toggle off if already active)
        if (e.key === 'p' || e.key === 'P')
          Reader.setActiveTool(Reader.activeTool === 'pen'       ? null : 'pen');
        if (e.key === 'h' || e.key === 'H')
          Reader.setActiveTool(Reader.activeTool === 'highlight' ? null : 'highlight');
        if (e.key === 'e' || e.key === 'E')
          Reader.setActiveTool(Reader.activeTool === 'eraser'    ? null : 'eraser');
        if (e.key === 'Escape') Reader.setActiveTool(null);
        // Bookmark
        if (e.key === 'b' || e.key === 'B') Reader.toggleBookmark(Reader.currentPage);
        // Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
          e.preventDefault();
          Reader.undoAnnotation();
        }
      };
      document.addEventListener('keydown', Reader._keyHandler);

      // ── Refit on window resize ──
      Reader._resizeHandler = () => {
        clearTimeout(Reader._resizeTimer);
        Reader._resizeTimer = setTimeout(() => {
          if (Reader.pdfDoc) Reader.renderPage(Reader.currentPage);
        }, 150);
      };
      window.addEventListener('resize', Reader._resizeHandler);

      Reader.updateDoneButton();
      Reader.updateBookmarkBtn(Reader.currentPage);

    } catch (err) {
      app.innerHTML = `<div class="empty-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Error loading material</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>`;
    }
  },

  // ── Load PDF ───────────────────────────────────────────
  async loadPDF(url, material) {
    const wrap = document.getElementById('pageWrap');
    if (wrap) wrap.classList.add('loading');
    try {
      const loadingTask = pdfjsLib.getDocument(url);
      Reader.pdfDoc = await loadingTask.promise;
      Reader.totalPages = Reader.pdfDoc.numPages;
      document.getElementById('totalPagesNum').textContent = Reader.totalPages;
      if (Reader.totalPages !== material.totalPages) {
        Reader.buildPageList({ ...material, totalPages: Reader.totalPages });
      }
      // Restore last read page
      const lastPage = Reader.getLastPage(Reader.materialId);
      Reader.currentPage = (lastPage > 1 && lastPage <= Reader.totalPages) ? lastPage : 1;
      await Reader._waitForLayout();
      await Reader.renderPage(Reader.currentPage);
    } catch (err) {
      console.error('PDF load error:', err);
      showToast('Failed to render PDF', 'error');
    } finally {
      if (wrap) wrap.classList.remove('loading');
    }
  },

  // ── Load image ─────────────────────────────────────────
  loadImage(url) {
    Reader.totalPages  = 1;
    Reader.currentPage = 1;
    document.getElementById('pdfCanvas').style.display = 'none';
    const img = document.getElementById('readerImg');
    img.src = url;
    img.style.display   = 'block';
    img.style.maxWidth  = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    document.getElementById('prevPageBtn').disabled = true;
    document.getElementById('nextPageBtn').disabled = true;
  },

  // ── Render page (auto-fit + DPR) ──────────────────────
  async renderPage(num) {
    if (!Reader.pdfDoc || Reader.rendering) return;
    Reader.rendering = true;

    const canvas = document.getElementById('pdfCanvas');
    const wrap   = document.getElementById('canvasWrap');

    canvas.style.opacity = '0';

    try {
      const page   = await Reader.pdfDoc.getPage(num);
      const availW = wrap.clientWidth  - 64;
      const availH = wrap.clientHeight - 64;
      const nat    = page.getViewport({ scale: 1 });

      const scaleW = availW / nat.width;
      const scaleH = availH / nat.height;
      Reader.fitScale = Math.min(scaleW, scaleH);

      const effectiveScale = Math.max(0.3, Reader.fitScale * Reader.userZoom);
      const dpr            = window.devicePixelRatio || 1;
      const viewport       = page.getViewport({ scale: effectiveScale * dpr });

      const cssW = Math.round(viewport.width  / dpr);
      const cssH = Math.round(viewport.height / dpr);

      canvas.width        = viewport.width;
      canvas.height       = viewport.height;
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';
      canvas.style.display = 'block';

      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      canvas.style.opacity = '1';

      document.getElementById('currentPageNum').textContent = num;
      document.getElementById('prevPageBtn').disabled = num <= 1;
      document.getElementById('nextPageBtn').disabled = num >= Reader.totalPages;
      Reader.updateZoomLabel();

      document.querySelectorAll('.page-list-item').forEach(el =>
        el.classList.toggle('active', parseInt(el.dataset.page) === num)
      );
      const active = document.querySelector('.page-list-item.active');
      if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

      // ── Sync annotation canvas then replay saved strokes ──
      Reader.updateAnnotCanvasSize(cssW, cssH);
      Reader.replayAnnotations(num);

    } catch (err) {
      console.error('Render error:', err);
    }

    Reader.rendering = false;
  },

  // ── Navigation ─────────────────────────────────────────
  goToPage(num) {
    if (num < 1 || num > Reader.totalPages || Reader.rendering) return;
    Reader.saveAnnotations(Reader.currentPage); // persist before leaving
    Reader.currentPage = num;
    Reader.renderPage(num);
    Reader.updateDoneButton();
    Reader.updateBookmarkBtn(num);
    Reader.updateUndoBtn(num);
    Reader.saveLastPage(Reader.materialId, num);
  },

  // ── Zoom ───────────────────────────────────────────────
  adjustZoom(delta) {
    Reader.userZoom = Math.min(4, Math.max(0.3, Reader.userZoom + delta));
    if (Reader.pdfDoc) Reader.renderPage(Reader.currentPage);
    else Reader.updateZoomLabel();
  },

  resetZoom() {
    Reader.userZoom = 1.0;
    if (Reader.pdfDoc) Reader.renderPage(Reader.currentPage);
    else Reader.updateZoomLabel();
  },

  updateZoomLabel() {
    const el = document.getElementById('zoomLevel');
    if (!el) return;
    el.textContent = Reader.userZoom === 1.0
      ? 'Fit'
      : `${Math.round(Reader.fitScale * Reader.userZoom * 100)}%`;
  },

  // ── Sidebar ────────────────────────────────────────────
  buildPageList(material) {
    const list = document.getElementById('pageList');
    if (!list) return;
    const completed = material.pagesCompleted || [];
    let html = '';
    for (let i = 1; i <= material.totalPages; i++) {
      const done       = completed.includes(i);
      const bookmarked = Reader._bookmarks.includes(i);
      html += `
        <div class="page-list-item ${done ? 'done' : ''} ${i === Reader.currentPage ? 'active' : ''}" data-page="${i}">
          <span class="page-num">
            ${i}${bookmarked
              ? '&nbsp;<i class="fas fa-bookmark" style="font-size:0.55rem;color:var(--accent);opacity:0.85"></i>'
              : ''}
          </span>
          <span class="page-status-icon">${done
            ? '<i class="fas fa-check-circle"></i>'
            : '<i class="far fa-circle"></i>'}</span>
        </div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll('.page-list-item').forEach(item =>
      item.addEventListener('click', () => Reader.goToPage(parseInt(item.dataset.page)))
    );
  },

  // ── Done button ────────────────────────────────────────
  updateDoneButton() {
    const btn  = document.getElementById('markDoneBtn');
    const text = document.getElementById('markDoneBtnText');
    const icon = document.getElementById('markDoneIcon');
    if (!btn || !Reader.materialData) return;
    const done = (Reader.materialData.pagesCompleted || []).includes(Reader.currentPage);
    btn.classList.toggle('is-done', done);
    if (text) text.textContent = done ? 'Completed ✓' : 'Mark Done';
    if (icon) icon.className   = done ? 'fas fa-undo'  : 'fas fa-check-circle';
    btn.title = done ? 'Unmark this page (D)' : 'Mark page as done (D)';
  },

  // ── Toggle page done ───────────────────────────────────
  async togglePageDone(courseId, materialId, pageNumber) {
    try {
      const res = await api(`/materials/${courseId}/${materialId}/toggle-page`, {
        method: 'PATCH',
        body: JSON.stringify({ pageNumber })
      });

      Reader.materialData.pagesCompleted = res.data.pagesCompleted;
      Reader.materialData.completedPages = res.data.completedPages;
      Reader.materialData.totalPages     = res.data.totalPages;

      const pct = Math.round((res.data.completedPages / res.data.totalPages) * 100);

      Reader.buildPageList(Reader.materialData);
      Reader.updateDoneButton();

      const el = document.getElementById('readerProgressText');
      if (el) el.textContent = `${pct}%`;

      const fill = document.getElementById('readerProgressFill');
      if (fill) {
        fill.style.width = `${pct}%`;
        fill.className   = `reader-progress-fill ${getProgressColor(pct)}`;
      }

      const sub = document.getElementById('readerSubtitle');
      if (sub) sub.textContent = `${res.data.completedPages}/${res.data.totalPages} pages completed`;

      const isDone = res.data.pagesCompleted.includes(pageNumber);
      showToast(isDone ? `Page ${pageNumber} done! 🎉` : `Page ${pageNumber} unmarked`, 'success');

      if (isDone && Reader.currentPage < Reader.totalPages) {
        setTimeout(() => Reader.goToPage(Reader.currentPage + 1), 500);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  },

  // ════════════════════════════════════════════════════════
  // ── ANNOTATION SYSTEM ───────────────────────────────────
  // ════════════════════════════════════════════════════════

  setupAnnotationCanvas() {
    const canvas = document.getElementById('annotCanvas');
    if (!canvas) return;
    Reader.annotCtx = canvas.getContext('2d');
    // Pointer-events off until a tool is selected
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor        = 'default';

    canvas.addEventListener('mousedown',  Reader._onDrawStart);
    canvas.addEventListener('mousemove',  Reader._onDrawMove);
    canvas.addEventListener('mouseup',    Reader._onDrawEnd);
    canvas.addEventListener('mouseleave', Reader._onDrawEnd);
    canvas.addEventListener('touchstart', Reader._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  Reader._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   Reader._onDrawEnd);
  },

  // Match annotation canvas exactly to rendered PDF canvas (CSS pixels)
  updateAnnotCanvasSize(cssW, cssH) {
    const canvas = document.getElementById('annotCanvas');
    if (!canvas) return;
    canvas.width        = cssW;
    canvas.height       = cssH;
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
  },

  // ── Active tool ─────────────────────────────────────────
  setActiveTool(tool) {
    Reader.activeTool = tool;
    const canvas = document.getElementById('annotCanvas');
    if (canvas) {
      canvas.style.pointerEvents = tool ? 'auto' : 'none';
      canvas.style.cursor = tool === 'eraser' ? 'cell'
                          : tool              ? 'crosshair'
                          :                    'default';
    }
    // Highlight active toolbar button
    ['pen', 'highlight', 'eraser'].forEach(t => {
      const btn = document.getElementById(`${t}Btn`);
      if (btn) btn.classList.toggle('active', t === tool);
    });
    // Show color palette only for highlighter
    const colors = document.getElementById('annotColors');
    if (colors) colors.classList.toggle('visible', tool === 'highlight');
  },

  // ── Wire annotation toolbar ─────────────────────────────
  setupAnnotToolbar() {
    // Tool toggle buttons
    ['pen', 'highlight', 'eraser'].forEach(tool => {
      const btn = document.getElementById(`${tool}Btn`);
      if (btn) btn.addEventListener('click', () =>
        Reader.setActiveTool(Reader.activeTool === tool ? null : tool)
      );
    });

    // Highlight colour swatches
    document.querySelectorAll('.annot-color').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.annot-color').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        Reader.highlightColor = dot.dataset.color;
        Reader.setActiveTool('highlight'); // auto-switch to highlighter
      });
    });

    // Stroke size selector
    const sizeEl = document.getElementById('strokeSizeSelect');
    if (sizeEl) sizeEl.addEventListener('change', () => {
      Reader.strokeSize = parseInt(sizeEl.value, 10);
    });

    // Undo button
    const undoBtn = document.getElementById('undoAnnotBtn');
    if (undoBtn) undoBtn.addEventListener('click', () => Reader.undoAnnotation());

    // Clear page annotations
    const clearBtn = document.getElementById('clearAnnotBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      const page = Reader.currentPage;
      if (!Reader._annotations[page] || Reader._annotations[page].length === 0) {
        showToast('No annotations on this page', 'success');
        return;
      }
      if (!confirm('Clear all annotations on this page?')) return;
      Reader._pushUndo(page);           // allow undoing a clear
      Reader._annotations[page] = [];
      Reader.saveAnnotations(page);
      Reader.replayAnnotations(page);
      Reader.updateUndoBtn(page);
      showToast('Annotations cleared', 'success');
    });

    // Bookmark button
    const bmBtn = document.getElementById('bookmarkBtn');
    if (bmBtn) bmBtn.addEventListener('click', () =>
      Reader.toggleBookmark(Reader.currentPage)
    );
  },

  // ── Low-level drawing ───────────────────────────────────
  _getPos(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  },

  // ── Offscreen canvas (reused for highlight compositing) ─
  _getOffscreen(w, h) {
    if (!Reader._offscreen ||
        Reader._offscreen.width  !== w ||
        Reader._offscreen.height !== h) {
      Reader._offscreen = document.createElement('canvas');
      Reader._offscreen.width  = w;
      Reader._offscreen.height = h;
    }
    return Reader._offscreen;
  },

  // ── Draw one stroke onto ctx using bezier smoothing ────
  // Highlight strokes are rendered via an offscreen canvas so their
  // alpha is applied once per stroke (no accumulation at segment joints).
  _drawStrokeOnCtx(ctx, stroke, w, h) {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    if (stroke.tool === 'highlight') {
      // 1. Draw full stroke at full opacity on a clean offscreen canvas
      const off    = Reader._getOffscreen(w, h);
      const offCtx = off.getContext('2d');
      offCtx.clearRect(0, 0, w, h);
      offCtx.strokeStyle = stroke.color;
      offCtx.fillStyle   = stroke.color;
      offCtx.lineWidth   = stroke.size * 8;
      offCtx.lineCap     = 'square';
      offCtx.lineJoin    = 'round';
      offCtx.globalAlpha = 1.0;
      offCtx.globalCompositeOperation = 'source-over';

      offCtx.beginPath();
      if (pts.length === 1) {
        offCtx.arc(pts[0].x * w, pts[0].y * h, offCtx.lineWidth / 2, 0, Math.PI * 2);
        offCtx.fill();
      } else {
        // Bezier smoothing: draw through midpoints
        offCtx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = ((pts[i].x + pts[i + 1].x) / 2) * w;
          const my = ((pts[i].y + pts[i + 1].y) / 2) * h;
          offCtx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, mx, my);
        }
        offCtx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h);
        offCtx.stroke();
      }

      // 2. Composite onto main canvas at target alpha — one flat, even layer
      ctx.globalAlpha = 0.30;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1.0;

    } else {
      // Pen / eraser — draw directly with smooth bezier curves
      ctx.globalCompositeOperation =
        stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.globalAlpha  = 1.0;
      const col        = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : stroke.color;
      ctx.strokeStyle  = col;
      ctx.fillStyle    = col;
      ctx.lineCap      = 'round';
      ctx.lineJoin     = 'round';
      ctx.lineWidth    = stroke.tool === 'eraser' ? stroke.size * 5 : stroke.size;

      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0].x * w, pts[0].y * h, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(pts[0].x * w, pts[0].y * h);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = ((pts[i].x + pts[i + 1].x) / 2) * w;
          const my = ((pts[i].y + pts[i + 1].y) / 2) * h;
          ctx.quadraticCurveTo(pts[i].x * w, pts[i].y * h, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x * w, pts[pts.length - 1].y * h);
        ctx.stroke();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
    }
  },

  _onDrawStart(e) {
    if (!Reader.activeTool) return;
    e.preventDefault();
    const canvas = document.getElementById('annotCanvas');
    const { x, y } = Reader._getPos(e, canvas);

    Reader.isDrawing = true;
    Reader._currentStroke = {
      tool:   Reader.activeTool,
      color:  Reader.activeTool === 'highlight' ? Reader.highlightColor : '#1e1e2e',
      size:   Reader.strokeSize,
      points: [{ x: x / canvas.width, y: y / canvas.height }]
    };

    // For pen/eraser: set up live incremental context
    if (Reader.activeTool !== 'highlight') {
      const ctx = Reader.annotCtx;
      const lw  = Reader.activeTool === 'eraser'
                    ? Reader.strokeSize * 5
                    : Reader.strokeSize;
      ctx.globalCompositeOperation =
        Reader.activeTool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.globalAlpha  = 1.0;
      ctx.strokeStyle  = Reader.activeTool === 'eraser' ? 'rgba(0,0,0,1)' : '#1e1e2e';
      ctx.fillStyle    = ctx.strokeStyle;
      ctx.lineCap      = 'round';
      ctx.lineJoin     = 'round';
      ctx.lineWidth    = lw;
      // Immediate dot so single clicks are visible
      ctx.beginPath();
      ctx.arc(x, y, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    // Highlight: nothing to draw yet — wait for first move
  },

  _onDrawMove(e) {
    if (!Reader.isDrawing || !Reader._currentStroke) return;
    e.preventDefault();
    const canvas = document.getElementById('annotCanvas');
    const { x, y } = Reader._getPos(e, canvas);
    const nx = x / canvas.width;
    const ny = y / canvas.height;
    Reader._currentStroke.points.push({ x: nx, y: ny });

    if (Reader._currentStroke.tool === 'highlight') {
      // Full redraw: committed strokes + live stroke via offscreen → no alpha bleed
      const ctx = Reader.annotCtx;
      const w   = canvas.width;
      const h   = canvas.height;
      ctx.clearRect(0, 0, w, h);
      (Reader._annotations[Reader.currentPage] || [])
        .forEach(s => Reader._drawStrokeOnCtx(ctx, s, w, h));
      Reader._drawStrokeOnCtx(ctx, Reader._currentStroke, w, h);
    } else {
      // Pen / eraser: fast incremental segment (style already set in _onDrawStart)
      const ctx = Reader.annotCtx;
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  },

  _onDrawEnd() {
    if (!Reader.isDrawing) return;
    Reader.isDrawing = false;

    const stroke = Reader._currentStroke;
    Reader._currentStroke = null;

    if (stroke && stroke.points.length > 0) {
      const page = Reader.currentPage;
      // Snapshot current state before modifying (for undo)
      Reader._pushUndo(page);
      if (!Reader._annotations[page]) Reader._annotations[page] = [];
      Reader._annotations[page].push(stroke);
      Reader.saveAnnotations(page);
      Reader.updateUndoBtn(page);
    }

    // Clean redraw so everything is in a canonical state
    Reader.replayAnnotations(Reader.currentPage);
  },

  _onTouchStart(e) { Reader._onDrawStart(e); },
  _onTouchMove(e)  { Reader._onDrawMove(e);  },

  // ── Undo system ────────────────────────────────────────
  _pushUndo(page) {
    if (!Reader._undoHistory[page]) Reader._undoHistory[page] = [];
    // Deep-copy current strokes so the snapshot is immutable
    Reader._undoHistory[page].push(
      JSON.parse(JSON.stringify(Reader._annotations[page] || []))
    );
    // Cap at 20 steps per page to avoid unbounded memory use
    if (Reader._undoHistory[page].length > 20) {
      Reader._undoHistory[page].shift();
    }
  },

  undoAnnotation() {
    const page = Reader.currentPage;
    const history = Reader._undoHistory[page];
    if (!history || history.length === 0) {
      showToast('Nothing to undo', 'success');
      return;
    }
    Reader._annotations[page] = history.pop();
    Reader.saveAnnotations(page);
    Reader.replayAnnotations(page);
    Reader.updateUndoBtn(page);
    showToast('Undone', 'success');
  },

  updateUndoBtn(page) {
    const btn = document.getElementById('undoAnnotBtn');
    if (!btn) return;
    const hasHistory = (Reader._undoHistory[page] || []).length > 0;
    btn.disabled = !hasHistory;
    btn.title = hasHistory ? 'Undo last stroke (Ctrl+Z)' : 'Nothing to undo';
  },

  // ── Replay all strokes for a page ──────────────────────
  replayAnnotations(pageNum) {
    const canvas = document.getElementById('annotCanvas');
    if (!canvas || !Reader.annotCtx) return;
    const ctx = Reader.annotCtx;
    const w   = canvas.width;
    const h   = canvas.height;
    ctx.clearRect(0, 0, w, h);
    (Reader._annotations[pageNum] || [])
      .forEach(s => Reader._drawStrokeOnCtx(ctx, s, w, h));
  },

  // ── Persistence ─────────────────────────────────────────
  saveAnnotations(pageNum) {
    if (!Reader.materialId) return;
    const key     = `annot_${Reader.materialId}_p${pageNum}`;
    const strokes = Reader._annotations[pageNum];
    if (strokes && strokes.length > 0) {
      try { localStorage.setItem(key, JSON.stringify(strokes)); }
      catch (e) { /* storage quota exceeded */ }
    } else {
      localStorage.removeItem(key);
    }
  },

  saveLastPage(materialId, pageNum) {
    if (materialId) localStorage.setItem(`lastPage_${materialId}`, pageNum);
  },

  getLastPage(materialId) {
    return parseInt(localStorage.getItem(`lastPage_${materialId}`), 10) || 1;
  },

  // ── Bookmarks ───────────────────────────────────────────
  toggleBookmark(pageNum) {
    const idx = Reader._bookmarks.indexOf(pageNum);
    if (idx === -1) {
      Reader._bookmarks.push(pageNum);
    } else {
      Reader._bookmarks.splice(idx, 1);
    }
    if (Reader.materialId) {
      localStorage.setItem(
        `bookmarks_${Reader.materialId}`,
        JSON.stringify(Reader._bookmarks)
      );
    }
    Reader.updateBookmarkBtn(pageNum);
    if (Reader.materialData) Reader.buildPageList(Reader.materialData);
    showToast(idx === -1 ? '🔖 Page bookmarked' : 'Bookmark removed', 'success');
  },

  updateBookmarkBtn(pageNum) {
    const icon = document.getElementById('bookmarkIcon');
    const btn  = document.getElementById('bookmarkBtn');
    if (!icon) return;
    const is = Reader._bookmarks.includes(pageNum);
    icon.className = is ? 'fas fa-bookmark' : 'far fa-bookmark';
    if (btn) btn.classList.toggle('active', is);
  },

  // ── Wait for viewer dimensions to settle ───────────────
  _waitForLayout() {
    return new Promise(resolve => {
      const check = () => {
        const wrap = document.getElementById('canvasWrap');
        if (wrap && wrap.clientWidth > 50 && wrap.clientHeight > 50) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  },

  // ── Cleanup ─────────────────────────────────────────────
  cleanup() {
    if (Reader._keyHandler) {
      document.removeEventListener('keydown', Reader._keyHandler);
      Reader._keyHandler = null;
    }
    if (Reader._resizeHandler) {
      window.removeEventListener('resize', Reader._resizeHandler);
      Reader._resizeHandler = null;
    }
    if (Reader._unloadHandler) {
      window.removeEventListener('beforeunload', Reader._unloadHandler);
      Reader._unloadHandler = null;
    }
    Reader.pdfDoc         = null;
    Reader.isDrawing      = false;
    Reader._currentStroke = null;
    Reader.activeTool     = null;
    Reader.annotCtx       = null;
    Reader._offscreen     = null;
    Reader._undoHistory   = {};
  }
};
