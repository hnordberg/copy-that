/**
 * Math-to-OMML (Office Math Markup Language) converter.
 *
 * Detects math from:
 *   1. MathML (<math> elements, KaTeX .katex-mathml, MathJax v3)
 *   2. LaTeX source (data-math attributes from KaTeX/custom renderers)
 *
 * Converts to the m:oMath XML that MS Office apps render as native equations.
 * Exposed on window.CopyThatMath for the content script.
 */
window.CopyThatMath = (() => {
  const OMML_NS = 'http://schemas.microsoft.com/office/2004/12/omml';
  const NARY_OPS = new Set([
    '\u2211', '\u220F', '\u2210', '\u222B', '\u222C', '\u222D',
    '\u22C2', '\u22C3', '\u22C0', '\u22C1',
  ]);
  const FENCE_PAIRS = {
    '(': ')', '[': ']', '{': '}', '|': '|',
    '\u2308': '\u2309', '\u230A': '\u230B', '\u27E8': '\u27E9',
  };

  // ── OMML builder helpers ──────────────────────────────────────────

  function escXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  const INVISIBLE = /[\u200B-\u200D\u2060-\u2064\uFEFF]/g;

  function omRun(text, style) {
    if (!text) return '';
    text = text.replace(INVISIBLE, '');
    if (!text) return '';
    const rPr = (style && style !== 'i')
      ? `<m:rPr><m:sty m:val="${style}"/></m:rPr>` : '';
    return `<m:r>${rPr}<m:t>${escXml(text)}</m:t></m:r>`;
  }

  function omDelim(open, close, inner) {
    let pr = '';
    if (open !== '(') pr += `<m:begChr m:val="${escXml(open)}"/>`;
    if (close !== ')') pr += `<m:endChr m:val="${escXml(close)}"/>`;
    const dPr = pr ? `<m:dPr>${pr}</m:dPr>` : '';
    return `<m:d>${dPr}<m:e>${inner}</m:e></m:d>`;
  }

  function omSub(base, sub) {
    return `<m:sSub><m:e>${base}</m:e><m:sub>${sub}</m:sub></m:sSub>`;
  }
  function omSup(base, sup) {
    return `<m:sSup><m:e>${base}</m:e><m:sup>${sup}</m:sup></m:sSup>`;
  }
  function omSubSup(base, sub, sup) {
    return `<m:sSubSup><m:e>${base}</m:e><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`;
  }
  function omFrac(num, den) {
    return `<m:f><m:num>${num}</m:num><m:den>${den}</m:den></m:f>`;
  }
  function omSqrt(body) {
    return `<m:rad><m:radPr><m:degHide m:val="on"/><m:ctrlPr/></m:radPr>` +
      `<m:deg/><m:e>${body}</m:e></m:rad>`;
  }
  function omRoot(deg, body) {
    return `<m:rad><m:deg>${deg}</m:deg><m:e>${body}</m:e></m:rad>`;
  }
  function omNary(chr, sub, sup, limLoc) {
    let pr = `<m:chr m:val="${escXml(chr)}"/><m:limLoc m:val="${limLoc || 'subSup'}"/>`;
    if (!sub) pr += '<m:subHide m:val="on"/>';
    if (!sup) pr += '<m:supHide m:val="on"/>';
    return `<m:nary><m:naryPr>${pr}</m:naryPr>` +
      `<m:sub>${sub}</m:sub><m:sup>${sup}</m:sup><m:e/></m:nary>`;
  }
  function omAcc(chr, body) {
    return `<m:acc><m:accPr><m:chr m:val="${escXml(chr)}"/></m:accPr>` +
      `<m:e>${body}</m:e></m:acc>`;
  }
  function omBar(pos, body) {
    return `<m:bar><m:barPr><m:pos m:val="${pos}"/></m:barPr>` +
      `<m:e>${body}</m:e></m:bar>`;
  }

  function expandSelfClosing(xml) {
    return xml.replace(/<(m:\w+)(\s[^>]*)?\s*\/>/g, '<$1$2></$1>');
  }

  function wrapOmath(inner, display) {
    const body = expandSelfClosing(inner);
    const omath = `<m:oMath xmlns:m="${OMML_NS}">${body}</m:oMath>`;
    return display
      ? `<m:oMathPara xmlns:m="${OMML_NS}">${omath}</m:oMathPara>`
      : omath;
  }

  // ── MathML → OMML ─────────────────────────────────────────────────

  function getTag(el) {
    return (el.localName || el.tagName || '').toLowerCase();
  }

  const NARY_TAGS = new Set(['munderover', 'munder', 'msub', 'msup', 'msubsup']);
  function isNaryProducer(node) {
    if (node.nodeType !== 1) return false;
    if (!NARY_TAGS.has(getTag(node))) return false;
    const first = node.children[0];
    return first && getTag(first) === 'mo' && NARY_OPS.has(first.textContent.trim());
  }

  function omChildList(nodes) {
    let r = '';
    for (let i = 0; i < nodes.length; i++) {
      const c = nodes[i];
      if (isNaryProducer(c)) {
        const nary = omNode(c);
        let body = '';
        for (let j = i + 1; j < nodes.length; j++) body += omNode(nodes[j]);
        r += nary.replace('<m:e/></m:nary>', `<m:e>${body}</m:e></m:nary>`);
        break;
      }
      r += omNode(c);
    }
    return r;
  }

  function omChildren(node) {
    return omChildList([...node.childNodes]);
  }

  function omNode(node) {
    if (node.nodeType === 3) {
      const t = node.textContent.trim();
      return t ? omRun(t) : '';
    }
    if (node.nodeType !== 1) return '';
    const tag = getTag(node);
    switch (tag) {
      case 'math': case 'mpadded': case 'mstyle': case 'menclose':
        return omChildren(node);
      case 'semantics':
        return node.children[0] ? omNode(node.children[0]) : '';
      case 'annotation': case 'annotation-xml': case 'mphantom': case 'mspace':
        return '';
      case 'mrow': return omMrow(node);
      case 'mi': return omMi(node);
      case 'mn': return omRun(node.textContent.trim());
      case 'mo': return omRun(node.textContent.trim());
      case 'mtext': case 'ms': return omRun(node.textContent.trim(), 'p');
      case 'msub': return omMsub(node);
      case 'msup': return omMsup(node);
      case 'msubsup': return omMsubsup(node);
      case 'mfrac': return omMfracML(node);
      case 'msqrt': return omSqrt(omChildren(node));
      case 'mroot': {
        const ch = [...node.children];
        return ch.length < 2 ? omSqrt(omChildren(node))
          : omRoot(omNode(ch[1]), omNode(ch[0]));
      }
      case 'mfenced': return omMfenced(node);
      case 'mover': return omMover(node);
      case 'munder': return omMunder(node);
      case 'munderover': return omMunderover(node);
      case 'mtable': return omMtable(node);
      case 'mtr': case 'mlabeledtr': return omMtr(node);
      case 'mtd': return omChildren(node);
      default: return omChildren(node);
    }
  }

  function omMrow(node) {
    const kids = [...node.childNodes].filter(n =>
      n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()));
    if (kids.length >= 2) {
      const f = kids[0], l = kids[kids.length - 1];
      if (f.nodeType === 1 && getTag(f) === 'mo' &&
          l.nodeType === 1 && getTag(l) === 'mo') {
        const oc = f.textContent.trim(), cc = l.textContent.trim();
        if (f.getAttribute('fence') === 'true' || FENCE_PAIRS[oc] === cc)
          return omDelim(oc, cc, omChildList(kids.slice(1, -1)));
      }
    }
    return omChildren(node);
  }

  function omMi(node) {
    const t = node.textContent.trim();
    if (!t) return '';
    const up = node.getAttribute('mathvariant') === 'normal' || t.length > 1;
    return omRun(t, up ? 'p' : 'i');
  }

  function mlNary(ch) {
    const bt = ch[0].textContent.trim();
    return getTag(ch[0]) === 'mo' && NARY_OPS.has(bt) ? bt : null;
  }

  function omMsub(node) {
    const ch = [...node.children]; if (ch.length < 2) return omChildren(node);
    const n = mlNary(ch);
    return n ? omNary(n, omNode(ch[1]), '') : omSub(omNode(ch[0]), omNode(ch[1]));
  }
  function omMsup(node) {
    const ch = [...node.children]; if (ch.length < 2) return omChildren(node);
    const n = mlNary(ch);
    return n ? omNary(n, '', omNode(ch[1])) : omSup(omNode(ch[0]), omNode(ch[1]));
  }
  function omMsubsup(node) {
    const ch = [...node.children]; if (ch.length < 3) return omChildren(node);
    const n = mlNary(ch);
    return n ? omNary(n, omNode(ch[1]), omNode(ch[2]))
      : omSubSup(omNode(ch[0]), omNode(ch[1]), omNode(ch[2]));
  }

  function omMfracML(node) {
    const ch = [...node.children];
    return ch.length < 2 ? omChildren(node) : omFrac(omNode(ch[0]), omNode(ch[1]));
  }

  function omMfenced(node) {
    const open = node.getAttribute('open') || '(';
    const close = node.getAttribute('close') || ')';
    const seps = (node.getAttribute('separators') || ',').replace(/\s/g, '');
    const ch = [...node.children];
    let inner = '';
    ch.forEach((c, i) => {
      if (i > 0) inner += omRun(seps[Math.min(i - 1, seps.length - 1)] || ',');
      inner += omNode(c);
    });
    return omDelim(open, close, inner);
  }

  function omMover(node) {
    const ch = [...node.children]; if (ch.length < 2) return omChildren(node);
    const ot = ch[1].textContent.trim();
    if (node.getAttribute('accent') === 'true' ||
        '\u0302\u0303\u0304\u0306\u0307\u0308\u030C\u20D7^~'.includes(ot))
      return omAcc(ot, omNode(ch[0]));
    if ('\u00AF\u203E\u0305'.includes(ot)) return omBar('top', omNode(ch[0]));
    return `<m:limUpp>` +
      `<m:e>${omNode(ch[0])}</m:e><m:lim>${omNode(ch[1])}</m:lim></m:limUpp>`;
  }

  function omMunder(node) {
    const ch = [...node.children]; if (ch.length < 2) return omChildren(node);
    const bt = ch[0].textContent.trim();
    if (getTag(ch[0]) === 'mo' && NARY_OPS.has(bt))
      return `<m:nary><m:naryPr><m:chr m:val="${escXml(bt)}"/>` +
        `<m:limLoc m:val="undOvr"/><m:supHide m:val="on"/>` +
        `</m:naryPr><m:sub>${omNode(ch[1])}</m:sub><m:sup/><m:e/></m:nary>`;
    const ut = ch[1].textContent.trim();
    if ('_\u0332'.includes(ut)) return omBar('bot', omNode(ch[0]));
    return `<m:limLow>` +
      `<m:e>${omNode(ch[0])}</m:e><m:lim>${omNode(ch[1])}</m:lim></m:limLow>`;
  }

  function omMunderover(node) {
    const ch = [...node.children]; if (ch.length < 3) return omChildren(node);
    const bt = ch[0].textContent.trim();
    if (getTag(ch[0]) === 'mo' && NARY_OPS.has(bt))
      return `<m:nary><m:naryPr><m:chr m:val="${escXml(bt)}"/>` +
        `<m:limLoc m:val="undOvr"/></m:naryPr>` +
        `<m:sub>${omNode(ch[1])}</m:sub><m:sup>${omNode(ch[2])}</m:sup><m:e/></m:nary>`;
    return `<m:limUpp><m:e>` +
      `<m:limLow>` +
      `<m:e>${omNode(ch[0])}</m:e><m:lim>${omNode(ch[1])}</m:lim></m:limLow>` +
      `</m:e><m:lim>${omNode(ch[2])}</m:lim></m:limUpp>`;
  }

  function omMtable(node) {
    const rows = [...node.children].filter(n =>
      n.nodeType === 1 && ['mtr', 'mlabeledtr'].includes(getTag(n)));
    return `<m:m>${rows.map(r => omMtr(r)).join('')}</m:m>`;
  }
  function omMtr(node) {
    const cells = [...node.children].filter(n =>
      n.nodeType === 1 && getTag(n) === 'mtd');
    return `<m:mr>${cells.map(c => `<m:e>${omChildren(c)}</m:e>`).join('')}</m:mr>`;
  }

  function mathMLtoOMML(mathEl) {
    return wrapOmath(omNode(mathEl), mathEl.getAttribute('display') === 'block');
  }

  // ── LaTeX → OMML ──────────────────────────────────────────────────

  const GREEK = {
    alpha:'\u03B1',beta:'\u03B2',gamma:'\u03B3',delta:'\u03B4',
    epsilon:'\u03B5',varepsilon:'\u03B5',zeta:'\u03B6',eta:'\u03B7',
    theta:'\u03B8',vartheta:'\u03D1',iota:'\u03B9',kappa:'\u03BA',
    lambda:'\u03BB',mu:'\u03BC',nu:'\u03BD',xi:'\u03BE',
    pi:'\u03C0',varpi:'\u03D6',rho:'\u03C1',varrho:'\u03F1',
    sigma:'\u03C3',varsigma:'\u03C2',tau:'\u03C4',upsilon:'\u03C5',
    phi:'\u03C6',varphi:'\u03C6',chi:'\u03C7',psi:'\u03C8',omega:'\u03C9',
    Gamma:'\u0393',Delta:'\u0394',Theta:'\u0398',Lambda:'\u039B',
    Xi:'\u039E',Pi:'\u03A0',Sigma:'\u03A3',Upsilon:'\u03A5',
    Phi:'\u03A6',Psi:'\u03A8',Omega:'\u03A9',
  };

  const SYMS = {
    cdot:'\u00B7',times:'\u00D7',div:'\u00F7',pm:'\u00B1',mp:'\u2213',
    ast:'\u2217',star:'\u22C6',circ:'\u2218',bullet:'\u2022',
    leq:'\u2264',le:'\u2264',geq:'\u2265',ge:'\u2265',
    neq:'\u2260',ne:'\u2260',approx:'\u2248',equiv:'\u2261',sim:'\u223C',
    ll:'\u226A',gg:'\u226B',prec:'\u227A',succ:'\u227B',
    infty:'\u221E',partial:'\u2202',nabla:'\u2207',ell:'\u2113',
    forall:'\u2200',exists:'\u2203',in:'\u2208',notin:'\u2209',ni:'\u220B',
    subset:'\u2282',supset:'\u2283',subseteq:'\u2286',supseteq:'\u2287',
    cup:'\u222A',cap:'\u2229',emptyset:'\u2205',varnothing:'\u2205',
    vee:'\u2228',wedge:'\u2227',lor:'\u2228',land:'\u2227',
    lnot:'\u00AC',neg:'\u00AC',
    rightarrow:'\u2192',leftarrow:'\u2190',to:'\u2192',gets:'\u2190',
    Rightarrow:'\u21D2',Leftarrow:'\u21D0',implies:'\u21D2',
    leftrightarrow:'\u2194',Leftrightarrow:'\u21D4',iff:'\u21D4',mapsto:'\u21A6',
    ldots:'\u2026',cdots:'\u22EF',vdots:'\u22EE',ddots:'\u22F1',dots:'\u2026',
    prime:'\u2032',angle:'\u2220',triangle:'\u25B3',
    langle:'\u27E8',rangle:'\u27E9',lceil:'\u2308',rceil:'\u2309',
    lfloor:'\u230A',rfloor:'\u230B',vert:'|',Vert:'\u2016',
    quad:' ',qquad:'  ',',':' ',';':' ',':':' ','!':'',
  };

  const NARY_LATEX = {
    sum:'\u2211',prod:'\u220F',coprod:'\u2210',
    int:'\u222B',iint:'\u222C',iiint:'\u222D',oint:'\u222E',
    bigcup:'\u22C3',bigcap:'\u22C2',bigvee:'\u22C1',bigwedge:'\u22C0',
    bigoplus:'\u2A01',bigotimes:'\u2A02',bigodot:'\u2A00',
  };

  const ACCENT_LATEX = {
    hat:'\u0302', tilde:'\u0303', vec:'\u20D7', dot:'\u0307',
    ddot:'\u0308', check:'\u030C', breve:'\u0306', acute:'\u0301', grave:'\u0300',
  };

  function latexToOMML(tex, display) {
    let src = tex, pos = 0;
    let lastRightDelim = ')';

    function peek() { return pos < src.length ? src[pos] : ''; }
    function adv()  { return src[pos++]; }
    function skip() { while (pos < src.length && /\s/.test(src[pos])) pos++; }

    function readCmd() {
      let c = '';
      while (pos < src.length && /[a-zA-Z]/.test(src[pos])) c += src[pos++];
      return c;
    }

    function readGroup() {
      skip();
      if (peek() !== '{') return null;
      adv();
      const r = parseExpr('}');
      if (peek() === '}') adv();
      return r;
    }

    function readToken() {
      skip();
      if (peek() === '{') return readGroup();
      if (peek() === '\\') { adv(); return handleCmd(readCmd()); }
      if (/[a-zA-Z]/.test(peek())) return omRun(adv(), 'i');
      if (/[0-9]/.test(peek())) {
        let n = '';
        while (/[0-9.]/.test(peek())) n += adv();
        return omRun(n);
      }
      return omRun(adv());
    }

    function readRawGroup() {
      skip();
      if (peek() !== '{') return '';
      adv();
      let depth = 1, r = '';
      while (pos < src.length && depth > 0) {
        if (src[pos] === '{') depth++;
        else if (src[pos] === '}') { if (--depth === 0) { pos++; return r; } }
        r += src[pos++];
      }
      return r;
    }

    function readDelimCh() {
      skip();
      if (peek() === '\\') {
        adv();
        if (peek() === '{' || peek() === '}') return adv();
        if (peek() === '|') { adv(); return '|'; }
        const c = readCmd();
        return SYMS[c] || c;
      }
      const ch = adv();
      return ch === '.' ? '' : ch;
    }

    const STYLE_NOOP = new Set([
      'displaystyle', 'textstyle', 'scriptstyle', 'scriptscriptstyle',
    ]);

    function handleCmd(cmd) {
      if (STYLE_NOOP.has(cmd)) return '';
      if (GREEK[cmd]) return omRun(GREEK[cmd], 'i');
      if (SYMS[cmd] !== undefined) return omRun(SYMS[cmd]);

      if (NARY_LATEX[cmd]) {
        const chr = NARY_LATEX[cmd];
        skip();
        let sub = '', sup = '';
        while (peek() === '_' || peek() === '^') {
          if (peek() === '_') { adv(); sub = readToken(); skip(); }
          else { adv(); sup = readToken(); skip(); }
        }
        return omNary(chr, sub, sup, display ? 'undOvr' : 'subSup');
      }

      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac')
        return omFrac(readGroup() || '', readGroup() || '');

      if (cmd === 'sqrt') {
        skip();
        if (peek() === '[') {
          adv();
          const deg = parseExpr(']');
          if (peek() === ']') adv();
          return omRoot(deg, readGroup() || readToken());
        }
        return omSqrt(readGroup() || readToken());
      }

      if (['text','textrm','textit','textbf','mathrm','mathbf','mathit',
           'operatorname','mathcal','mathbb','mathsf','textsc'].includes(cmd)) {
        const raw = readRawGroup();
        const sty = (cmd === 'textit' || cmd === 'mathit') ? 'i' : 'p';
        return omRun(raw, sty);
      }

      if (ACCENT_LATEX[cmd]) return omAcc(ACCENT_LATEX[cmd], readGroup() || readToken());
      if (cmd === 'overline' || cmd === 'bar') return omBar('top', readGroup() || readToken());
      if (cmd === 'underline') return omBar('bot', readGroup() || readToken());

      if (cmd === 'left') {
        const openCh = readDelimCh();
        const inner = parseExpr('');
        const closeCh = peek() ? '' : '';
        return omDelim(openCh || '(', closeCh || ')', inner);
      }
      if (cmd === 'right') {
        readDelimCh();
        return '';
      }

      if (cmd === 'begin') {
        const env = readRawGroup();
        return parseEnv(env);
      }

      return omRun(cmd, 'p');
    }

    function parseEnv(env) {
      const endTag = '\\end{' + env + '}';
      let body = '';
      while (pos < src.length) {
        if (src.substring(pos, pos + endTag.length) === endTag) {
          pos += endTag.length;
          break;
        }
        body += adv();
      }

      const matDelims = {
        pmatrix:['(',')'], bmatrix:['[',']'], Bmatrix:['{','}'],
        vmatrix:['|','|'], Vmatrix:['\u2016','\u2016'],
        cases:['{',''],
      };

      const rows = body.split('\\\\').map(row => {
        const cells = row.split('&').map(cell => {
          const saved = [src, pos];
          src = cell.trim(); pos = 0;
          const r = parseExpr('');
          [src, pos] = saved;
          return r;
        });
        return `<m:mr>${cells.map(c => `<m:e>${c}</m:e>`).join('')}</m:mr>`;
      });
      let mat = `<m:m>${rows.join('')}</m:m>`;

      const d = matDelims[env];
      if (d) mat = omDelim(d[0] || '(', d[1] || ')', mat);
      return mat;
    }

    function parseExpr(term) {
      let result = '';
      while (pos < src.length) {
        skip();
        if (pos >= src.length) break;
        const ch = peek();
        if (ch === term) break;
        if (ch === '}') break;

        let atom = '';

        if (ch === '{') {
          atom = readGroup() || '';
        } else if (ch === '\\') {
          const sp = pos;
          adv();
          const cmd = readCmd();
          if (cmd === 'right') { lastRightDelim = readDelimCh() || ')'; break; }
          if (cmd === 'end') { pos = sp; break; }
          if (cmd === 'left') {
            const openCh = readDelimCh();
            lastRightDelim = ')';
            const inner = parseExpr('');
            atom = omDelim(openCh || '(', lastRightDelim, inner);
          } else if (cmd === '') {
            atom = omRun(peek() ? adv() : '\\');
          } else {
            atom = handleCmd(cmd);
          }
        } else if (/[a-zA-Z]/.test(ch)) {
          atom = omRun(adv(), 'i');
        } else if (/[0-9]/.test(ch)) {
          let n = '';
          while (/[0-9.]/.test(peek())) n += adv();
          atom = omRun(n);
        } else if ('+-=<>!*'.includes(ch) || ch === '\u2212') {
          atom = omRun(adv());
        } else if (ch === '(' || ch === ')' || ch === '[' || ch === ']') {
          if (ch === term) break;
          atom = omRun(adv());
        } else if (ch === ',' || ch === ';' || ch === ':') {
          atom = omRun(adv());
        } else if (ch === '|') {
          atom = omRun(adv());
        } else if (ch === '\'') {
          adv(); atom = omRun('\u2032');
        } else if (ch === '_' || ch === '^') {
          adv();
          const s = readToken();
          atom = ch === '_' ? omSub(omRun(''), s) : omSup(omRun(''), s);
        } else {
          atom = omRun(adv());
        }

        skip();
        let sub = null, sup = null;
        while (peek() === '_' || peek() === '^') {
          if (peek() === '_' && !sub) { adv(); sub = readToken(); skip(); }
          else if (peek() === '^' && !sup) { adv(); sup = readToken(); skip(); }
          else break;
        }
        if (sub && sup) atom = omSubSup(atom, sub, sup);
        else if (sub) atom = omSub(atom, sub);
        else if (sup) atom = omSup(atom, sup);

        if (atom.includes('<m:e/></m:nary>')) {
          const body = parseExpr(term);
          atom = atom.replace('<m:e/></m:nary>', `<m:e>${body}</m:e></m:nary>`);
          result += atom;
          return result;
        }

        result += atom;
      }
      return result;
    }

    return wrapOmath(parseExpr(''), !!display);
  }

  // ── Detection & wrapping ──────────────────────────────────────────

  const LATEX_ALT_RE = /\\[a-zA-Z]/;

  function stripDisplayStyle(tex) {
    const m = tex.match(/^\{\\(?:displaystyle|textstyle)\s+([\s\S]*)\}$/);
    return m ? m[1].trim() : tex;
  }

  function findMathElements(container) {
    const results = [];
    const handled = new Set();

    function mark(el) {
      handled.add(el);
      const p = el.closest && el.closest('[data-math]');
      if (p) handled.add(p);
    }

    function isHandled(el) {
      if (handled.has(el)) return true;
      for (const h of handled) {
        if (h.contains && h.contains(el)) return true;
      }
      return false;
    }

    // 1. KaTeX with MathML
    container.querySelectorAll('.katex').forEach(el => {
      const m = el.querySelector('.katex-mathml math, math');
      if (m) {
        const outer = (el.closest && el.closest('[data-math]')) || el;
        results.push({ element: outer, mathml: m, latex: null });
        mark(el); mark(outer);
      }
    });

    // 2. MathJax v3
    container.querySelectorAll('mjx-container').forEach(el => {
      if (handled.has(el)) return;
      const m = el.querySelector('math');
      if (m) { results.push({ element: el, mathml: m, latex: null }); mark(el); }
    });

    // 3. Native <math> elements — also detects when a renderer pairs hidden
    //    MathML with a visible duplicate (SVG text in Google AI Overview,
    //    fallback <img> in Wikipedia, etc.) and replaces the whole container.
    container.querySelectorAll('math').forEach(m => {
      if (isHandled(m)) return;
      let wrapper = null;
      for (let el = m.parentElement; el; el = el.parentElement) {
        if (el === container) {
          // Walk-up reached the container (can't replace it). Use the direct
          // child of container that wraps <math> so the OMML placeholder
          // doesn't end up inside a display:none span.
          let dc = m;
          while (dc.parentElement && dc.parentElement !== container)
            dc = dc.parentElement;
          if (dc !== m) wrapper = dc;
          // Remove sibling duplicates from the temp DOM entirely.
          const cImg = el.querySelector(':scope > img[alt]');
          if (cImg && LATEX_ALT_RE.test(cImg.getAttribute('alt'))) {
            mark(cImg); cImg.remove();
          }
          const cSvg = el.querySelector(':scope > svg text');
          if (cSvg) { const s = cSvg.closest('svg'); if (s) { mark(s); s.remove(); } }
          break;
        }
        if (el.querySelector(':scope > svg text')) { wrapper = el; break; }
        const img = el.querySelector(':scope > img[alt]');
        if (img && LATEX_ALT_RE.test(img.getAttribute('alt'))) {
          wrapper = el; break;
        }
      }
      if (wrapper) {
        results.push({ element: wrapper, mathml: m, latex: null });
        mark(wrapper);
      } else {
        results.push({ element: m, mathml: m, latex: null });
        mark(m);
      }
    });

    // 4. LaTeX via data-math attribute (KaTeX HTML-only or custom renderers)
    container.querySelectorAll('[data-math]').forEach(el => {
      if (handled.has(el)) return;
      const tex = el.getAttribute('data-math');
      if (tex) {
        const isBlock = el.classList.contains('math-block') ||
          el.querySelector('.katex-display') !== null;
        results.push({ element: el, mathml: null, latex: tex, display: isBlock });
        handled.add(el);
      }
    });

    // 5. Standalone math images whose alt text contains LaTeX (e.g. Wikipedia
    //    fallback images not paired with a <math> element)
    container.querySelectorAll('img[alt]').forEach(img => {
      if (isHandled(img)) return;
      const alt = (img.getAttribute('alt') || '').trim();
      if (!alt || !LATEX_ALT_RE.test(alt)) return;
      const tex = stripDisplayStyle(alt);
      if (tex) {
        results.push({ element: img, mathml: null, latex: tex });
        handled.add(img);
      }
    });

    return results;
  }

  function buildMsOfficeHtml(bodyContent) {
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office"' +
      ' xmlns:m="' + OMML_NS + '"' +
      ' xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>' +
      '<body>' + bodyContent + '</body></html>';
  }

  function stripInvisible(s) {
    return s.replace(INVISIBLE, '');
  }

  function mathText(mathEl) {
    const sem = mathEl.querySelector('semantics');
    if (sem && sem.children[0]) return sem.children[0].textContent || '';
    return mathEl.textContent || '';
  }

  return {
    escXml, mathMLtoOMML, latexToOMML,
    findMathElements, buildMsOfficeHtml,
    stripInvisible, mathText,
  };
})();
