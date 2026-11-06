// HERESY 2085 (Viktor 05.11.2026: «в Движок в Hardware добавь топологию, она полезна тем, кто понимает в это, — как мы.»): Engine → Hardware → Topology,
// over the lab's topology.py: each card's NUMA node, its PCIe link (as it runs now, its own most, the slot's most) and its PCI address, an Intel card by
// its sysfs alone (a card behind a switch of its own read at that switch); NVIDIA's matrix (nvidia-smi topo -m) under a one-line legend, and P2P between
// each pair (-p2p r) where the driver tells it. The lab looks once and keeps it; the Engine's opening asks it to look again. No NVIDIA here: said
// plainly. The words go into the page in English and the catalogs put them in its language (again when it changes); the codes and the numbers never.
//   HeresyTopology.load(fresh) · HeresyTopology.state()
(function () {
  "use strict";
  var S = { data: null, asking: null };
  var LEG_TOPO = "X the card itself · PIX through one PCIe bridge · PXB through several bridges · PHB through a host bridge (the CPU) · NODE between host bridges of one NUMA node · SYS across the link between NUMA nodes (QPI/UPI) · NV# through # NVLinks";
  var LEG_P2P = "P2P, a card reading another's memory directly: OK it can · CNS the chipset does not allow it · GNS the GPU does not · TNS the topology does not · NS not supported · U unknown";
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function link(l) { return l ? (l.gen ? "Gen" + l.gen : esc(l.speed || "?")) + (l.width ? " x" + l.width : "") : "—"; }
  function label(c) { return window.HeresyGpuLabel ? window.HeresyGpuLabel(c.index, c.name) : c.label + " · " + c.name; }
  function kind(v) {                                   // a path's length in colour: NVLink and OK the best, through the sockets the farthest
    v = String(v || "");
    return v === "X" ? "is-self" : /^NV\d+$/.test(v) || v === "OK" ? "is-best" : v === "PIX" || v === "PXB" ? "is-near" : v === "PHB" || v === "NODE" ? "is-mid" :
      v === "SYS" ? "is-far" : /^(CNS|GNS|TNS|NS|U)$/.test(v) ? "is-no" : "";
  }
  function matrix(t, cls) {                            // nvidia-smi's own table, its headers and codes as it prints them
    var paths = t.cols.filter(function (c) { return /^(GPU|NIC)\d+$/.test(c); }).length;
    return '<table class="topo-matrix ' + cls + '" translate="no"><thead><tr><th></th>' + t.cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + t.rows.map(function (r) {
        return "<tr><th>" + esc(r.name) + "</th>" + r.cells.map(function (v, i) { return '<td class="' + (i < paths ? kind(v) : "is-aff") + '">' + esc(v) + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }
  function paint() {
    var d = S.data, el = $("topoBody");
    if (!el || !d) return;
    var cards = d.cards || [], nv = cards.filter(function (c) { return c.kind === "nvidia"; }).length, h = "";
    if (!d.nvidia) h += d.error ? '<p class="row-hint topo-none">nvidia-smi does not answer: ' + esc(d.error) + "</p>"
      : '<p class="row-hint topo-none">No NVIDIA card here: nvidia-smi is not on this machine.</p>';
    if (cards.length) {
      h += '<table class="topo-cards"><thead><tr><th>GPU</th><th>NUMA node</th><th>Link now</th><th>Its most</th><th>The slot\'s most</th><th>PCI address</th></tr></thead><tbody>' +
        cards.map(function (c) {
          var l = c.link || {};
          return '<tr data-card="' + esc(c.label) + '"><td class="mono" translate="no">' + esc(label(c)) + '</td><td class="mono" translate="no">' + (c.numa == null ? "—" : esc(c.numa)) +
            '</td><td class="mono" translate="no">' + link(l.now) + '</td><td class="mono" translate="no">' + link(l.max) + '</td><td class="mono" translate="no">' + link(l.slot) +
            '</td><td><span class="mono" translate="no">' + esc(c.bdf) + "</span>" + (l.via ? ' <span class="topo-via">behind its own bridge ' + esc(l.via) + "</span>" : "") + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    if (d.nvidia && nv) {
      h += '<div class="topo-cap"><code>nvidia-smi topo -m</code></div>' + (d.matrix ? matrix(d.matrix, "topo-m") : '<pre class="topo-raw">' + esc(d.raw) + "</pre>") +
        '<p class="hint topo-legend">' + esc(LEG_TOPO) + "</p>";
      h += d.p2p ? '<div class="topo-cap"><code>nvidia-smi topo -p2p r</code></div>' + matrix(d.p2p, "topo-p2p") + '<p class="hint topo-legend">' + esc(LEG_P2P) + "</p>"
        : '<p class="hint topo-legend">P2P: this driver does not tell.</p>';
    }
    el.innerHTML = h;
  }
  function load(fresh) {
    if (!$("topoCard")) return Promise.resolve(null);
    if (S.asking) return S.asking;
    S.asking = fetch("/lab/topology" + (fresh ? "?fresh=1" : "")).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "HTTP " + r.status); return d; });
    }).then(function (d) { S.data = d; paint(); return d; }, function (e) {
      if (!S.data) $("topoBody").innerHTML = '<p class="row-hint"><span>The lab does not answer:</span> <span translate="no">' + esc(e.message) + "</span></p>";
      return null;
    }).then(function (d) { S.asking = null; return d; });
    return S.asking;
  }
  window.HeresyTopology = { load: load, state: function () { return S.data; }, legends: function () { return { topo: LEG_TOPO, p2p: LEG_P2P }; } };
})();
