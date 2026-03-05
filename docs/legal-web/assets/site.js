(function () {
  function byId(id) { return document.getElementById(id); }

  var yearEl = byId("js-year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
