// Al pulsar el icono se abre el panel lateral.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Con un texto seleccionado en cualquier web: «Buscar en GovTalent» en el
// menú del botón derecho (0.4.0). Chrome entrega solo el texto elegido; la
// extensión no lee la página.
function crearMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'gt-buscar', title: 'Buscar «%s» en GovTalent', contexts: ['selection'] });
  });
}
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  crearMenu();
});
chrome.runtime.onStartup.addListener(crearMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'gt-buscar' || !tab) return;
  // Abrir el panel tiene que ir lo primero: solo se permite dentro del gesto.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  const texto = String(info.selectionText || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (texto) chrome.storage.session.set({ gtSeleccion: { texto, en: Date.now() } });
});
