/* Nur Web-Version (iPad/Safari): Offline-Betrieb und iPad-Feinheiten. Die Android-App lädt diese Datei nicht. */
(function () {
  // Offline: alle Dateien über den Service Worker zwischenspeichern
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        // neue Version gefunden → beim nächsten Start aktiv; kurzer Hinweis
        reg.addEventListener('updatefound', function () {
          var nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', function () {
            if (nw.state === 'installed' && navigator.serviceWorker.controller && typeof toast === 'function') toast('Update geladen – wird beim nächsten Start aktiv.', 4000);
          });
        });
      }).catch(function (e) { console.warn('Service Worker', e); });
    });
  }
  // Safari: Zoomen der ganzen Seite per Zwei-Finger-Geste verhindern (die App zoomt selbst)
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });
  // Doppeltippen soll nicht die Seite vergrößern
  var last = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - last < 320 && !(e.target.closest && e.target.closest('input,textarea,select,[contenteditable]'))) e.preventDefault();
    last = now;
  }, { passive: false });
})();
