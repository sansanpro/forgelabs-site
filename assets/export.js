/* ForgeLabs: turning leads into emails and files.
   No DOM and no network, so the same code runs in the browser and in the tests.
   XLSX and DOCX are ZIP files of XML, written directly rather than through a large
   library: a page that holds a signed-in session should load as little third-party
   code as possible. jsPDF is the one exception, vendored in /assets/vendor/. */
(function (root) {
  "use strict";

  /* ── template rendering ───────────────────────────────────────── */

  /* A line that held a variable and came out empty is removed, so {{spend_line}}
     on its own line simply disappears when there is nothing to say. */
  function render(tpl, vars) {
    var lines = String(tpl || "").split(/\r?\n/);
    var out = [];
    lines.forEach(function (line) {
      var had = /\{\{\s*[a-z_]+\s*\}\}/.test(line);
      var v = line.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, function (_, k) {
        return vars[k] == null ? "" : String(vars[k]);
      });
      if (had && !v.trim()) return;
      out.push(v.replace(/[ \t]+$/, ""));
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function variables(lead, account) {
    var f = lead.facts || {};
    var first = (lead.owner_name || "").trim().split(/\s+/)[0];
    var domain = f.domain || lead.domain || "";
    return {
      greeting: first ? "Hi " + first + "," : "Hi,",
      business: lead.business || "",
      trade: f.trade || "Facebook",
      spend_line: f.spend_line || "",
      domain: domain || "your site",
      domain_note: domain && f.template === "messaging"
        ? "You've got a website, " + domain + ", and the ad doesn't point at it." : "",
      finding: f.finding || "",
      more_findings: f.more_findings || "",
      phone_note: f.phone ? " to " + f.phone : "",
      ad_id: lead.ad_library_id || "",
      ad_link: lead.ad_url || "",
      offer_line: (account && account.offer_line) || "",
      sender_name: (account && account.sender_name) || "",
      company: (account && account.company) || "",
      booking_link: (account && account.booking_link) || ""
    };
  }

  /* -> {subject, body} or null when no template fits this lead. */
  function draft(lead, account, templates) {
    var key = lead.facts && lead.facts.template;
    var t = key && (templates || []).filter(function (x) { return x.key === key; })[0];
    if (!t) return null;
    var vars = variables(lead, account);
    return { subject: render(t.subject, vars), body: render(t.body, vars) };
  }

  /* ── labels ───────────────────────────────────────────────────── */

  var FUNNEL = {
    none: "Ad has nothing to click",
    text_link_only: "Link only in the caption",
    instant_form: "Facebook form",
    messaging: "Opens Messenger",
    call: "Phone only",
    website: "Goes to a website"
  };
  function funnelLabel(t) { return FUNNEL[t] || t || ""; }

  function evidence(lead) {
    return (lead.signals || []).filter(function (s) { return s.polarity !== "negative"; })
      .map(function (s) { return s.evidence; });
  }
  function pageFindings(lead) {
    return ((lead.site_audit && lead.site_audit.findings) || []).map(function (f) { return f.text; });
  }
  function day(iso) { return iso ? String(iso).slice(0, 10) : ""; }

  /* ── tabular: CSV and Excel ───────────────────────────────────── */

  var COLUMNS = [
    ["Business", function (l) { return l.business; }],
    ["Vertical", function (l) { return l.vertical; }],
    ["City", function (l) { return l.city; }],
    ["State", function (l) { return l.state; }],
    ["Grade", function (l) { return l.grade; }],
    ["Grade notes", function (l) { return (l.grade_notes || []).join("; "); }],
    ["Priority", function (l) { return l.score_word; }],
    ["Where the ad goes", function (l) { return funnelLabel(l.funnel_type); }],
    ["Why", function (l) { return l.funnel_reason; }],
    ["Findings", function (l) { return evidence(l).join(" | "); }],
    ["Landing page findings", function (l) { return pageFindings(l).join(" | "); }],
    ["Ad Library ID", function (l) { return l.ad_library_id; }],
    ["Ad link", function (l) { return l.ad_url; }],
    ["Facebook Page", function (l) { return l.page_url; }],
    ["Landing page", function (l) { return l.destination_url; }],
    ["Website", function (l) { return l.domain; }],
    ["Email", function (l) { return l.email; }],
    ["Phone", function (l) { return l.phone; }],
    ["Owner (inferred)", function (l) { return l.owner_name; }],
    ["Contact source", function (l) { return (l.contact_sources || []).join(" | "); }],
    ["Checked", function (l) { return day(l.checked_at); }],
    ["Status", function (l) { return l.status; }]
  ];

  function rows(leads, account, templates) {
    var head = COLUMNS.map(function (c) { return c[0]; }).concat(["Email subject", "Email body"]);
    var body = leads.map(function (l) {
      var d = draft(l, account, templates) || { subject: "", body: "" };
      return COLUMNS.map(function (c) { var v = c[1](l); return v == null ? "" : String(v); })
        .concat([d.subject, d.body]);
    });
    return [head].concat(body);
  }

  /* Ad copy is written by strangers. A cell starting with = or + is a formula to
     Excel, so a scraped ad could otherwise run one on the customer's machine. */
  function neutralise(v) {
    return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
  }

  function toCSV(leads, account, templates) {
    return rows(leads, account, templates).map(function (r) {
      return r.map(function (v) {
        v = neutralise(v);
        return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",");
    }).join("\r\n");
  }

  /* ── ZIP (stored, no compression), which Office accepts ───────── */

  var CRC = (function () {
    var t = [], c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    var c = 0xffffffff;
    for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function utf8(s) { return new TextEncoder().encode(s); }

  function zip(files) {
    var parts = [], central = [], offset = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    /* 1 Jan 2026, a fixed stamp, so the same input gives the same file */
    var date = ((2026 - 1980) << 9) | (1 << 5) | 1;
    files.forEach(function (f) {
      var name = utf8(f[0]), data = utf8(f[1]), crc = crc32(data);
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(date), u32(crc),
        u32(data.length), u32(data.length), u16(name.length), u16(0));
      var local = new Uint8Array([0x50, 0x4b, 3, 4].concat(common));
      parts.push(local, name, data);
      central.push({ common: common, name: name, offset: offset });
      offset += local.length + name.length + data.length;
    });
    var cdStart = offset, cdLen = 0;
    central.forEach(function (c) {
      var head = new Uint8Array([0x50, 0x4b, 1, 2].concat(u16(20), c.common,
        u16(0), u16(0), u16(0), u32(0), u32(c.offset)));
      parts.push(head, c.name);
      cdLen += head.length + c.name.length;
    });
    parts.push(new Uint8Array([0x50, 0x4b, 5, 6, 0, 0, 0, 0].concat(
      u16(central.length), u16(central.length), u32(cdLen), u32(cdStart), u16(0))));
    var total = parts.reduce(function (n, p) { return n + p.length; }, 0);
    var out = new Uint8Array(total), at = 0;
    parts.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  /* XML has no way to carry most control characters, so they are dropped. */
  function xml(s) {
    return String(s == null ? "" : s)
      .replace(/[^\u0009\u000A\u000D -퟿-�]/g, "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  var XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  function colName(i) {
    var s = "";
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }

  function toXLSX(leads, account, templates) {
    var table = rows(leads, account, templates);
    var sheet = table.map(function (r, y) {
      var cells = r.map(function (v, x) {
        /* Excel's cell limit; a longer value makes the whole file "corrupt". */
        var text = String(v).slice(0, 32000);
        return '<c r="' + colName(x) + (y + 1) + '" t="inlineStr"' + (y === 0 ? ' s="1"' : "") +
          '><is><t xml:space="preserve">' + xml(text) + "</t></is></c>";
      }).join("");
      return '<row r="' + (y + 1) + '">' + cells + "</row>";
    }).join("");
    var last = colName(table[0].length - 1) + table.length;
    return zip([
      ["[Content_Types].xml", XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        "</Types>"],
      ["_rels/.rels", XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        "</Relationships>"],
      ["xl/workbook.xml", XML_HEAD +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ["xl/_rels/workbook.xml.rels", XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>"],
      ["xl/styles.xml", XML_HEAD +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        "</styleSheet>"],
      ["xl/worksheets/sheet1.xml", XML_HEAD +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<dimension ref="A1:' + last + '"/>' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        "<sheetData>" + sheet + "</sheetData>" +
        '<autoFilter ref="A1:' + last + '"/></worksheet>']
    ]);
  }

  /* ── reports: Word and PDF share one outline ──────────────────── */

  /* -> [{kind: title|sub|h1|h2|p|li|mono, text}] for the whole document. */
  function outline(leads, account, templates, opts) {
    var o = [];
    var who = (account && account.company) || "";
    o.push({ kind: "title", text: "Meta ads audit" });
    o.push({ kind: "sub", text: (who ? "Prepared by " + who + " · " : "") + (opts && opts.date || "") +
      " · " + leads.length + (leads.length === 1 ? " business" : " businesses") });
    leads.forEach(function (l, i) {
      o.push({ kind: "h1", text: l.business, brk: i > 0 });
      o.push({ kind: "p", text: [l.vertical, [l.city, l.state].filter(Boolean).join(", "),
        "Grade " + l.grade, "Checked " + day(l.checked_at)].filter(Boolean).join(" · ") });
      o.push({ kind: "h2", text: "Where the ad goes" });
      o.push({ kind: "p", text: funnelLabel(l.funnel_type) + (l.funnel_reason ? ": " + l.funnel_reason : "") });
      var ev = evidence(l);
      if (ev.length) {
        o.push({ kind: "h2", text: "What was found" });
        ev.forEach(function (t) { o.push({ kind: "li", text: t }); });
      }
      var pf = pageFindings(l);
      if (pf.length) {
        o.push({ kind: "h2", text: "On the landing page" + (l.site_audit.url ? " (" + l.site_audit.url + ")" : "") });
        pf.forEach(function (t) { o.push({ kind: "li", text: t }); });
      }
      o.push({ kind: "h2", text: "Check it yourself" });
      o.push({ kind: "p", text: "Ad Library ID " + l.ad_library_id + (l.ad_url ? ": " + l.ad_url : "") });
      if (l.email || l.phone || l.domain) {
        o.push({ kind: "h2", text: "Contact" });
        [["Email", l.email], ["Phone", l.phone], ["Website", l.domain], ["Owner (inferred)", l.owner_name]]
          .forEach(function (c) { if (c[1]) o.push({ kind: "li", text: c[0] + ": " + c[1] }); });
      }
      if (opts && opts.includeEmail) {
        var d = draft(l, account, templates);
        if (d) {
          o.push({ kind: "h2", text: "Draft email: " + d.subject });
          d.body.split(/\n/).forEach(function (t) { o.push({ kind: "p", text: t }); });
        }
      }
    });
    return o;
  }

  function toDOCX(leads, account, templates, opts) {
    var STY = { title: "Title", sub: "Subtitle", h1: "Heading1", h2: "Heading2" };
    var body = outline(leads, account, templates, opts).map(function (b) {
      var pPr = "";
      if (STY[b.kind]) pPr += '<w:pStyle w:val="' + STY[b.kind] + '"/>';
      if (b.brk) pPr += "<w:pageBreakBefore/>";
      if (b.kind === "li") pPr += '<w:ind w:left="360" w:hanging="200"/>';
      return "<w:p>" + (pPr ? "<w:pPr>" + pPr + "</w:pPr>" : "") + '<w:r><w:t xml:space="preserve">' +
        xml((b.kind === "li" ? "• " : "") + b.text) + "</w:t></w:r></w:p>";
    }).join("");
    function style(id, name, size, bold, extra) {
      return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/>' +
        '<w:basedOn w:val="Normal"/><w:qFormat/>' +
        '<w:pPr><w:spacing w:before="' + (extra || 120) + '" w:after="80"/></w:pPr>' +
        "<w:rPr>" + (bold ? "<w:b/>" : "") + '<w:sz w:val="' + size + '"/></w:rPr></w:style>';
    }
    return zip([
      ["[Content_Types].xml", XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
        "</Types>"],
      ["_rels/.rels", XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>"],
      ["word/_rels/document.xml.rels", XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        "</Relationships>"],
      ["word/styles.xml", XML_HEAD +
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
        style("Title", "Title", 52, true) + style("Subtitle", "Subtitle", 22, false) +
        style("Heading1", "heading 1", 34, true, 240) + style("Heading2", "heading 2", 24, true, 200) +
        "</w:styles>"],
      ["word/document.xml", XML_HEAD +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        body + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1200" w:bottom="1200" w:left="1200"/></w:sectPr>' +
        "</w:body></w:document>"]
    ]);
  }

  /* The built-in PDF fonts are Latin-1 only; anything else would print as junk. */
  function latin(s) {
    return String(s == null ? "" : s)
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-").replace(/…/g, "...")
      .replace(/[^\u0009\u000A\u000D -ÿ]/g, "");
  }

  function toPDF(leads, account, templates, opts, jsPDF) {
    var doc = new jsPDF({ unit: "pt", format: "letter" });
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    var M = 54, y = M;
    var STY = {
      title: [24, "bold", 10], sub: [10.5, "normal", 18], h1: [17, "bold", 8],
      h2: [11.5, "bold", 4], p: [10.5, "normal", 6], li: [10.5, "normal", 4]
    };
    outline(leads, account, templates, opts).forEach(function (b) {
      var s = STY[b.kind] || STY.p;
      if (b.brk && y > M) { doc.addPage(); y = M; }
      if (b.kind === "h2") y += 8;
      doc.setFont("helvetica", s[1]);
      doc.setFontSize(s[0]);
      var indent = b.kind === "li" ? 12 : 0;
      var text = latin(b.text);
      if (!text.trim()) { y += 8; return; }
      var wrapped = doc.splitTextToSize(text, W - M * 2 - indent);
      wrapped.forEach(function (line, i) {
        if (y + s[0] > H - M) { doc.addPage(); y = M; }
        if (b.kind === "li" && i === 0) doc.text("-", M, y + s[0]);
        doc.text(line, M + indent, y + s[0]);
        y += s[0] * 1.32;
      });
      y += s[2];
    });
    return new Uint8Array(doc.output("arraybuffer"));
  }

  var api = {
    render: render, variables: variables, draft: draft, funnelLabel: funnelLabel,
    evidence: evidence, pageFindings: pageFindings, rows: rows, toCSV: toCSV,
    toXLSX: toXLSX, toDOCX: toDOCX, toPDF: toPDF, outline: outline, zip: zip
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FLExport = api;
})(this);
