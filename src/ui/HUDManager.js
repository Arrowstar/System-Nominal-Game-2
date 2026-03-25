export class HUDManager {
  constructor(rootElement, idPrefix) {
    this.root = rootElement;
    this.idPrefix = idPrefix;
    
    // Load config from localStorage
    const saved = localStorage.getItem(`sysnom_hud_${this.idPrefix}`);
    this.config = saved ? JSON.parse(saved) : {
      layout: {},
      minimized: {}
    };
    
    this.panels = {};
    this.zones = {};
    this.draggedPanelId = null;
    this.isMounted = false;
    
    this._buildZones();
    this._buildResetButton();
  }
  
  _buildResetButton() {
    this.resetBtn = document.createElement('div');
    this.resetBtn.className = 'hud-reset-btn';
    this.resetBtn.style.cssText = `
      position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%);
      font-size: 8px; color: rgba(255,255,255,0.2); cursor: pointer;
      letter-spacing: 0.1em; pointer-events: all; text-transform: uppercase;
      opacity: 0.5; transition: opacity 0.2s, color 0.2;
    `;
    this.resetBtn.textContent = 'RESET HUD LAYOUT';
    this.resetBtn.onmouseover = () => { this.resetBtn.style.opacity = '1'; this.resetBtn.style.color = '#39ff14'; };
    this.resetBtn.onmouseout = () => { this.resetBtn.style.opacity = '0.5'; this.resetBtn.style.color = 'rgba(255,255,255,0.2)'; };
    this.resetBtn.onclick = () => this.resetLayout();
    
    this.root.appendChild(this.resetBtn);
  }

  resetLayout() {
    if (confirm('RESSET ALL HUD PANEL POSITIONS TO DEFAULTS?')) {
      this.config.layout = {};
      localStorage.removeItem(`sysnom_hud_${this.idPrefix}`);
      this.mountAll();
    }
  }
  
  _buildZones() {
    this.zoneContainer = document.createElement('div');
    this.zoneContainer.id = `${this.idPrefix}-hud-zones`;
    this.zoneContainer.className = 'hud-zone-container';
    
    // 7 fixed zones
    const zoneStyles = {
      'top-left': 'top: 24px; left: 24px; flex-direction: column; align-items: flex-start;',
      'top-center': 'top: 24px; left: 50%; transform: translateX(-50%); flex-direction: column; align-items: center;',
      'middle-left': 'top: 50%; left: 24px; transform: translateY(-50%); flex-direction: column; align-items: flex-start;',
      'bottom-left': 'bottom: 24px; left: 24px; flex-direction: column-reverse; align-items: flex-start;',
      'bottom-center': 'bottom: 24px; left: 50%; transform: translateX(-50%); flex-direction: column-reverse; align-items: center;',
      'top-right': 'top: 24px; right: 24px; flex-direction: column; align-items: flex-end;',
      'middle-right': 'top: 50%; right: 24px; transform: translateY(-50%); flex-direction: column; align-items: flex-end;',
      'bottom-right': 'bottom: 24px; right: 24px; flex-direction: column-reverse; align-items: flex-end;',
    };
    
    for (const [id, style] of Object.entries(zoneStyles)) {
      const zone = document.createElement('div');
      zone.className = `hud-zone hud-zone-${id}`;
      zone.dataset.zoneId = id;
      zone.style.cssText = `
        position: absolute; display: flex; gap: 8px;
        pointer-events: none; min-width: 150px; min-height: 50px;
        ${style}
      `;
      
      zone.addEventListener('dragover', (e) => {
         e.preventDefault();
         e.dataTransfer.dropEffect = 'move';
         zone.classList.add('hud-zone-over');
      });
      zone.addEventListener('dragleave', () => {
         zone.classList.remove('hud-zone-over');
      });
      zone.addEventListener('drop', (e) => {
         e.preventDefault();
         zone.classList.remove('hud-zone-over');
         this._onDrop(e, zone);
      });
      
      this.zoneContainer.appendChild(zone);
      this.zones[id] = zone;
    }
    
    this.root.appendChild(this.zoneContainer);
  }
  
  createPanel(params) {
    const { id, title, defaultZone, contentEl, minWidth, borderColor } = params;
    const bColor = borderColor || 'rgba(57,255,20,0.25)';
    
    const panel = document.createElement('div');
    panel.className = 'hud-dock-panel';
    panel.dataset.panelId = id;
    panel.style.cssText = `
      pointer-events: all;
      background: rgba(8,11,15,0.85); border: 1px solid ${bColor};
      min-width: ${minWidth || '180px'};
      display: flex; flex-direction: column;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    `;
    
    const header = document.createElement('div');
    header.className = 'hud-dock-header';
    header.style.cssText = `
      display: flex; justify-content: space-between; align-items: center;
      padding: 6px 10px; background: rgba(0,0,0,0.2); border-bottom: 1px solid ${bColor};
      cursor: grab; user-select: none;
    `;
    header.draggable = true;
    
    const titleEl = document.createElement('div');
    titleEl.style.cssText = `font-size: 10px; color: #fff; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; pointer-events: none;`;
    titleEl.textContent = title;
    
    const minBtn = document.createElement('div');
    minBtn.style.cssText = `font-size: 14px; color: #8b949e; cursor: pointer; padding: 0 4px; line-height: 1;`;
    minBtn.textContent = '−';
    
    header.appendChild(titleEl);
    header.appendChild(minBtn);
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'hud-dock-content';
    // Let content handle its own padding, or keep it consistent here
    // ContentEl usually had its own padding in previous absolute positioning
    contentWrapper.appendChild(contentEl);
    
    panel.appendChild(header);
    panel.appendChild(contentWrapper);
    
    // Interactions
    minBtn.addEventListener('click', () => {
      this.toggleMinimize(id);
    });
    
    header.addEventListener('dragstart', (e) => {
      this.draggedPanelId = id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      setTimeout(() => panel.style.opacity = '0.4', 0);
      
      // Enable visual drop zones
      for (const z of Object.values(this.zones)) {
        z.style.pointerEvents = 'all';
        z.classList.add('hud-zone-active');
      }
    });
    
    header.addEventListener('dragend', () => {
      this.draggedPanelId = null;
      panel.style.opacity = '1';
      for (const z of Object.values(this.zones)) {
        z.style.pointerEvents = 'none';
        z.classList.remove('hud-zone-active');
        z.classList.remove('hud-zone-over');
      }
    });
    
    this.panels[id] = { panel, contentWrapper, minBtn, defaultZone };
    
    if (this.config.minimized[id]) {
      this._applyMinimize(id, true);
    }
    
    // If we've already run mountAll, append this new panel to its default zone immediately
    if (this.isMounted) {
       this._mountPanelToBestZone(id);
    }
    
    return panel;
  }
  
  _mountPanelToBestZone(pid) {
    const p = this.panels[pid];
    if (!p) return;
    
    // Check if it's already in the config (saved position)
    let targetZoneId = null;
    for (const [zId, pids] of Object.entries(this.config.layout)) {
      if (pids.includes(pid)) {
        targetZoneId = zId;
        break;
      }
    }
    
    const zoneId = targetZoneId || p.defaultZone || 'top-left';
    const zone = this.zones[zoneId];
    if (zone) {
      // Don't append if already child
      if (p.panel.parentNode !== zone) {
        zone.appendChild(p.panel);
        // Ensure it's in config if it wasn't
        if (!targetZoneId) {
          if (!this.config.layout[zoneId]) this.config.layout[zoneId] = [];
          if (!this.config.layout[zoneId].includes(pid)) this.config.layout[zoneId].push(pid);
        }
      }
    }
  }
  
  mountAll() {
    this.isMounted = true;
    Object.values(this.zones).forEach(z => z.innerHTML = '');
    
    const assignedIds = new Set();
    
    // Place saved layout
    for (const [zoneId, panelIds] of Object.entries(this.config.layout)) {
      if (!this.zones[zoneId]) continue;
      for (const pid of panelIds) {
        if (this.panels[pid]) {
          this.zones[zoneId].appendChild(this.panels[pid].panel);
          assignedIds.add(pid);
        }
      }
    }
    
    // Place remaining unassigned
    for (const [pid, p] of Object.entries(this.panels)) {
      if (!assignedIds.has(pid)) {
        const zId = p.defaultZone || 'top-left';
        if (this.zones[zId]) {
          this.zones[zId].appendChild(p.panel);
          if (!this.config.layout[zId]) this.config.layout[zId] = [];
          this.config.layout[zId].push(pid);
        }
      }
    }
    
    this.saveConfig();
  }
  
  toggleMinimize(id) {
    const isMin = this.config.minimized[id];
    this.config.minimized[id] = !isMin;
    this._applyMinimize(id, !isMin);
    this.saveConfig();
  }
  
  _applyMinimize(id, isMin) {
    const p = this.panels[id];
    if (!p) return;
    if (isMin) {
      p.contentWrapper.style.display = 'none';
      p.minBtn.textContent = '+';
      p.minBtn.style.color = '#39ff14';
    } else {
      p.contentWrapper.style.display = 'block';
      p.minBtn.textContent = '−';
      p.minBtn.style.color = '#8b949e';
    }
  }
  
  _onDrop(e, zone) {
    const pid = e.dataTransfer.getData('text/plain');
    if (!pid || !this.panels[pid]) return;
    
    const panel = this.panels[pid].panel;
    
    // Simple vertical sorting logic
    const afterElement = this._getDragAfterElement(zone, e.clientY);
    if (afterElement == null) {
      zone.appendChild(panel);
    } else {
      zone.insertBefore(panel, afterElement);
    }
    
    this._updateLayoutFromDOM();
  }
  
  _getDragAfterElement(zone, y) {
    const draggables = [...zone.querySelectorAll('.hud-dock-panel:not([style*="opacity: 0.4"])')];
    
    return draggables.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      // If dropping higher up than the element's midpoint, insert before it
      // offset < 0 means mouse is above the element's center
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
  
  _updateLayoutFromDOM() {
    this.config.layout = {};
    for (const [zId, zone] of Object.entries(this.zones)) {
      const children = [...zone.children];
      this.config.layout[zId] = children.map(c => c.dataset.panelId);
    }
    this.saveConfig();
  }
  
  saveConfig() {
    localStorage.setItem(`sysnom_hud_${this.idPrefix}`, JSON.stringify(this.config));
  }
  
  destroy() {
    this.zoneContainer.remove();
  }
}
