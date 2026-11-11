(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- 저장 (실패해도 게임은 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem('subway:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('subway:' + k, JSON.stringify(v)); } catch { /* 무시 */ } },
  };

  // ---------- 이름 정규화 ----------
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '').replace(/\(.*?\)/g, '').replace(/역$/, '');
  function acceptedNames(station) {
    const out = [station];
    const m = station.match(/\((.*?)\)/);
    if (m) out.push(m[1]);
    return out.concat(ALIASES[station] || []).map(norm);
  }
  const isCorrect = (input, station) => acceptedNames(station).includes(norm(input));

  // 초성 힌트
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const choseong = (s) => [...s.replace(/\(.*?\)/g, '')].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join('');

  // ---------- 노선 도우미 ----------
  // 순환선 첫 구간은 마지막 중복 역 제거
  const segOf = (line, i) => (line.circular && i === 0 ? line.segments[0].slice(0, -1) : line.segments[i]);
  const stationsOf = (line) => [...new Set(line.segments.flat())];
  function setLineColor(el, line, prop = '--c') { el.style.setProperty(prop, line.color); }

  // 노선 배지: 짧은 글자(1, 2, 경의, A)와 색
  const badgeText = (line) => line.badge || line.id;
  function applyBadge(el, line) {
    const t = badgeText(line);
    el.textContent = t;
    el.classList.toggle('long', t.length > 1);
    setLineColor(el, line);
    return el;
  }

  // 받침 있으면 '과/이', 없으면 '와/가' (예: 2호선과, GTX-A와)
  function hasBatchim(word) {
    const ch = word.trim().slice(-1);
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
    if (/[0-9]/.test(ch)) return '013678'.includes(ch);
    return /[lmnr]/i.test(ch);
  }

  // ---------- 전동차 그림 (노선 색으로 칠한 SVG) ----------
  let svgSeq = 0;
  function trainSVG(line) {
    const c = line.color;
    const id = 'tb' + (++svgSeq);
    const express = line.train === 'express';
    const label = badgeText(line);
    const body = express
      ? 'M14 24 Q14 14 24 14 H292 Q320 14 336 40 L347 62 Q350 72 339 72 H24 Q14 72 14 62 Z'
      : 'M14 24 Q14 14 24 14 H328 Q346 14 346 32 V62 Q346 72 336 72 H24 Q14 72 14 62 Z';
    const nose = express
      ? `<path d="M284 14 H292 Q320 14 336 40 L347 62 Q350 72 339 72 H284 Z" fill="${c}"/>
         <path d="M296 21 Q314 21 326 40 L330 47 H296 Z" fill="#26304a"/>
         <circle cx="338" cy="62" r="3" fill="#ffe58a"/>`
      : `<path d="M304 14 H328 Q346 14 346 32 V62 Q346 72 336 72 H304 Z" fill="${c}"/>
         <rect x="318" y="22" width="20" height="22" rx="4" fill="#26304a"/>
         <circle cx="339" cy="62" r="3" fill="#ffe58a"/>`;
    const windows = [56, 130, 204].map((x) => `<rect x="${x}" y="22" width="40" height="20" rx="4" fill="#26304a"/>
      <rect x="${x + 4}" y="25" width="10" height="4" rx="2" fill="#ffffff" opacity=".25"/>`).join('');
    const doors = [102, 176, 250].map((x) => `<rect x="${x}" y="19" width="22" height="50" rx="3" fill="#dde2ea" stroke="#b7becb"/>
      <rect x="${x + 4}" y="24" width="14" height="16" rx="3" fill="#26304a"/>`).join('');
    const wheels = [52, 78, 262, 288].map((x) => `<circle cx="${x}" cy="80" r="8" fill="#3b4254"/><circle cx="${x}" cy="80" r="3" fill="#9aa1b2"/>`).join('');
    return `<svg viewBox="0 0 360 96" role="img" aria-label="${line.name} 전동차">
      <defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>
      <rect x="0" y="88" width="360" height="4" rx="2" fill="#8b93a6" opacity=".55"/>
      ${wheels}
      <path d="${body}" fill="#f3f5f9" stroke="#c3c9d4" stroke-width="1.5"/>
      <g clip-path="url(#${id})">
        <rect x="0" y="50" width="360" height="8" fill="${c}"/>
        <rect x="0" y="14" width="360" height="4" fill="${c}" opacity=".9"/>
        ${nose}
      </g>
      ${windows}${doors}
      <circle cx="34" cy="34" r="12" fill="${c}" stroke="#fff" stroke-width="2.5"/>
      <text x="34" y="34" dy=".36em" text-anchor="middle" font-size="${label.length > 1 ? 9 : 13}" font-weight="800" fill="#fff" font-family="Pretendard, 'Malgun Gothic', sans-serif">${label}</text>
    </svg>`;
  }

  // 열차가 들어오는 그림 (여러 노선이면 여러 대)
  function renderTrains(el, lines) {
    el.classList.toggle('two', lines.length > 1);
    el.innerHTML = lines.map((l, i) => `<div class="train" style="animation-delay:${i * 0.15}s">${trainSVG(l)}</div>`).join('');
  }

  // ---------- 환승역 목록 만들기 ----------
  // 노선마다 표기가 다른 같은 역은 하나로 묶음
  const SAME_STATION = { '총신대입구(이수)': '이수' };
  const canon = (s) => SAME_STATION[s] || s;

  const TRANSFER_PAIRS = [];
  for (let i = 0; i < LINES.length; i++) {
    for (let j = i + 1; j < LINES.length; j++) {
      const a = LINES[i], b = LINES[j];
      const blocked = new Set([...(a.noTransfer || []), ...(b.noTransfer || [])]);
      const bSet = new Set(stationsOf(b).map(canon));
      const shared = stationsOf(a).filter((s) => bSet.has(canon(s)) && !blocked.has(s));
      if (shared.length) TRANSFER_PAIRS.push({ a, b, shared });
    }
  }

  // ---------- 화면 전환 ----------
  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
    window.scrollTo(0, 0);
  }
  $$('[data-home]').forEach((b) => b.addEventListener('click', () => { renderHome(); heroTrain(); show('home'); }));

  // ---------- 홈 ----------
  let quizLines = new Set(store.get('quizLines', LINES.map((l) => l.id)));
  let answerMode = store.get('answerMode', 'choice');

  function renderHome() {
    const picker = $('#quiz-lines');
    picker.innerHTML = '';
    LINES.forEach((line) => {
      const b = document.createElement('button');
      b.className = 'line-chip' + (quizLines.has(line.id) ? '' : ' off');
      applyBadge(b, line);
      b.title = line.name;
      b.addEventListener('click', () => {
        if (quizLines.has(line.id)) { if (quizLines.size > 1) quizLines.delete(line.id); }
        else quizLines.add(line.id);
        store.set('quizLines', [...quizLines]);
        renderHome();
      });
      picker.appendChild(b);
    });

    $$('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.answer === answerMode));

    const bestBlank = store.get('bestQuiz', null);
    $('#best-quiz').textContent = bestBlank != null ? `최고 점수 ${bestBlank}점` : '';
    const bestTransfer = store.get('bestTransfer', null);
    $('#best-transfer').textContent = bestTransfer != null ? `최고 점수 ${bestTransfer}점` : '';
  }

  // 첫 화면 열차: 누를 때마다 다른 노선 열차가 들어옴
  let heroIdx = rand(LINES.length);
  function heroTrain() {
    const line = LINES[heroIdx];
    renderTrains($('#hero-train'), [line]);
    $('#hero-train-name').textContent = `${line.name} 열차가 들어옵니다`;
    setLineColor($('#hero-train-name'), line, 'color');
  }
  $('#hero-train').addEventListener('click', () => { heroIdx = (heroIdx + 1) % LINES.length; heroTrain(); });

  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    answerMode = b.dataset.answer;
    store.set('answerMode', answerMode);
    renderHome();
  }));

  // ---------- 퀴즈 공통 ----------
  // mode: 'blank'(빈칸 퀴즈) | 'transfer'(환승역 퀴즈)
  const ROUNDS = 10;
  const quiz = { mode: 'blank', round: 0, score: 0, q: null, hinted: false, answered: false, used: new Set(), log: [] };
  const usesTyping = () => quiz.mode === 'blank' && answerMode === 'type';

  // 빈칸 퀴즈 문제: 앞뒤 역을 보고 가운데 역 맞히기
  function makeBlankQuestion() {
    const pool = LINES.filter((l) => quizLines.has(l.id));
    for (let tries = 0; tries < 100; tries++) {
      const line = pool[rand(pool.length)];
      // 구간 길이에 비례해 구간 선택
      const lens = line.segments.map((_, i) => segOf(line, i).length);
      let r = rand(lens.reduce((a, b) => a + b, 0)), si = 0;
      while (r >= lens[si]) r -= lens[si++];
      const seg = segOf(line, si);
      const circ = line.circular && si === 0;
      const n = seg.length;
      if (n < 3) continue;
      const i = circ ? rand(n) : 1 + rand(n - 2);
      const at = (k) => (circ ? seg[((k % n) + n) % n] : seg[k]);
      const answer = seg[i];
      if (quiz.used.has(answer)) continue;
      quiz.used.add(answer);
      const exclude = new Set([answer, at(i - 1), at(i + 1)]);
      const wrong = shuffle(stationsOf(line).filter((s) => !exclude.has(s))).slice(0, 3);
      return {
        type: 'blank', line, answer, choices: shuffle([answer, ...wrong]),
        prev2: at(i - 2), prev: at(i - 1), next: at(i + 1), next2: at(i + 2),
      };
    }
    return null;
  }

  // 환승역 퀴즈 문제: 두 노선이 만나는 역 맞히기
  function makeTransferQuestion() {
    for (let tries = 0; tries < 100; tries++) {
      const pair = TRANSFER_PAIRS[rand(TRANSFER_PAIRS.length)];
      const key = pair.a.id + '-' + pair.b.id;
      if (quiz.used.has(key) && tries < 60) continue;
      quiz.used.add(key);
      const [lineA, lineB] = Math.random() < 0.5 ? [pair.a, pair.b] : [pair.b, pair.a];
      const answer = pair.shared[rand(pair.shared.length)];
      const others = pair.shared.filter((s) => s !== answer);
      const sharedCanon = new Set(pair.shared.map(canon));
      const pool = [...new Set([...stationsOf(pair.a), ...stationsOf(pair.b)])].filter((s) => !sharedCanon.has(canon(s)));
      const wrong = shuffle(pool).slice(0, 3);
      return { type: 'transfer', line: lineA, lineB, answer, others, choices: shuffle([answer, ...wrong]) };
    }
    return null;
  }

  function startQuiz(mode) {
    Object.assign(quiz, { mode, round: 0, score: 0, used: new Set(), log: [] });
    show('quiz');
    nextQuestion();
  }

  function nextQuestion() {
    if (quiz.round >= ROUNDS) return endQuiz();
    const q = quiz.mode === 'transfer' ? makeTransferQuestion() : makeBlankQuestion();
    if (!q) return endQuiz();
    quiz.q = q; quiz.round++; quiz.hinted = false; quiz.answered = false;

    const card = $('.question');
    setLineColor($('#quiz'), q.line);
    card.classList.remove('shake', 'solved-ok');
    renderDots();
    renderHead();
    $('#q-score').textContent = quiz.score;
    $('#q-feedback').textContent = '';
    $('#q-feedback').className = 'feedback';
    $('#q-hint-text').textContent = '';
    $('#q-hint').disabled = false;
    $('#q-next').classList.add('hidden');

    renderBoard(false);

    const choices = $('#q-choices');
    const form = $('#q-form');
    choices.innerHTML = '';
    if (!usesTyping()) {
      choices.classList.remove('hidden');
      form.classList.add('hidden');
      q.choices.forEach((s) => {
        const b = document.createElement('button');
        b.className = 'choice';
        b.textContent = s;
        b.addEventListener('click', () => answer(s, b));
        choices.appendChild(b);
      });
    } else {
      choices.classList.add('hidden');
      form.classList.remove('hidden');
      const input = $('#q-input');
      input.value = '';
      input.disabled = false;
      input.focus();
    }
  }

  // 문제 머리: 노선 배지 + 질문
  function renderHead() {
    const q = quiz.q;
    const b1 = $('#q-badge'), b2 = $('#q-badge2');
    applyBadge(b1, q.line);
    const title = $('#q-title');
    renderTrains($('#q-train'), q.type === 'transfer' ? [q.line, q.lineB] : [q.line]);
    if (q.type === 'transfer') {
      b2.classList.remove('hidden');
      applyBadge(b2, q.lineB);
      const pA = hasBatchim(q.line.name) ? '과' : '와';
      const pB = hasBatchim(q.lineB.name) ? '이' : '가';
      title.innerHTML = `<b class="ln-a"></b>${pA} <b class="ln-b"></b>${pB}<br>만나는 역은?`;
      title.querySelector('.ln-a').textContent = q.line.name;
      title.querySelector('.ln-b').textContent = q.lineB.name;
      setLineColor(title.querySelector('.ln-a'), q.line, 'color');
      setLineColor(title.querySelector('.ln-b'), q.lineB, 'color');
    } else {
      b2.classList.add('hidden');
      title.textContent = `${quiz.round}번째 역 · 빈칸에 들어갈 역은?`;
    }
  }

  // 문제 그림
  function renderBoard(solved) {
    const q = quiz.q;
    const board = $('#q-track');
    if (q.type === 'transfer') {
      // 두 노선이 교차하는 그림
      board.className = 'sign cross';
      setLineColor(board, q.line, '--ca');
      setLineColor(board, q.lineB, '--cb');
      board.innerHTML = `
        <div class="bar a"></div><div class="bar b"></div>
        <span class="end a1"></span><span class="end a2"></span>
        <span class="end b1"></span><span class="end b2"></span>
        <div class="sign-center ${solved ? 'solved' : 'unknown'}"><small>환승역</small><strong></strong></div>`;
      board.querySelectorAll('.end.a1, .end.a2').forEach((e) => { e.textContent = badgeText(q.line); e.classList.toggle('long', badgeText(q.line).length > 1); });
      board.querySelectorAll('.end.b1, .end.b2').forEach((e) => { e.textContent = badgeText(q.lineB); e.classList.toggle('long', badgeText(q.lineB).length > 1); });
      board.querySelector('strong').textContent = solved ? q.answer : '?';
      return;
    }
    // 역 표지판: ◀ 이전역 | [ 이 역 ] | 다음역 ▶
    board.className = 'sign';
    board.innerHTML = `
      <div class="sign-side left"><small></small><b></b><span class="gap"></span></div>
      <div class="sign-center ${solved ? 'solved' : 'unknown'}"><small></small><strong></strong></div>
      <div class="sign-side right"><small></small><b></b><span class="gap"></span></div>`;
    const [l, r] = board.querySelectorAll('.sign-side');
    l.querySelector('small').textContent = q.prev2 ? `${q.prev2} ·` : '';
    l.querySelector('b').textContent = `◀ ${q.prev}`;
    r.querySelector('small').textContent = q.next2 ? `· ${q.next2}` : '';
    r.querySelector('b').textContent = `${q.next} ▶`;
    board.querySelector('.sign-center small').textContent = q.line.name;
    board.querySelector('.sign-center strong').textContent = solved ? q.answer : '?';
  }

  function renderDots() {
    const dots = $('#q-dots');
    dots.innerHTML = '';
    for (let i = 0; i < ROUNDS; i++) {
      const d = document.createElement('i');
      const log = quiz.log[i];
      if (log) d.className = log.ok ? 'ok' : 'no';
      else if (i === quiz.round - 1) d.className = 'now';
      dots.appendChild(d);
    }
  }

  // 정답 효과: 화면 요소 중심에서 색 조각이 튐
  function burst(el, colorList) {
    const fx = $('#fx');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const colors = [...colorList, '#ffffff', '#ffd23f'];
    for (let i = 0; i < 24; i++) {
      const s = document.createElement('span');
      s.className = 'spark';
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 90;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.background = colors[i % colors.length];
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
      s.style.setProperty('--r', rand(360) + 'deg');
      fx.appendChild(s);
      setTimeout(() => s.remove(), 1000);
    }
  }

  function answer(given, btn) {
    if (quiz.answered) return;
    const q = quiz.q;
    const ok = isCorrect(given, q.answer);
    if (usesTyping() && !ok && !given.trim()) return;
    quiz.answered = true;
    const pts = ok ? (quiz.hinted ? 5 : 10) : 0;
    quiz.score += pts;
    quiz.log.push({ q, given, ok });

    $('#q-score').textContent = quiz.score;
    $('#q-hint').disabled = true;
    const fb = $('#q-feedback');
    fb.className = 'feedback ' + (ok ? 'good' : 'bad');
    let text = ok ? `정답! +${pts}점` : `아쉬워요. 정답은 "${q.answer}"`;
    if (q.type === 'transfer' && q.others.length) text += ` · ${q.others.join(', ')}에서도 만나요`;
    fb.textContent = text;

    renderBoard(true);
    renderDots();
    const card = $('.question');
    if (ok) card.classList.add('solved-ok');
    if (ok) burst($('#q-track .sign-center'), q.lineB ? [q.line.color, q.lineB.color] : [q.line.color]);
    else { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }

    if (!usesTyping()) {
      $$('#q-choices .choice').forEach((b) => {
        b.disabled = true;
        if (b.textContent === q.answer) b.classList.add('right');
        else if (b !== btn) b.classList.add('dim');
      });
      if (!ok && btn) btn.classList.add('wrong');
    } else {
      $('#q-input').disabled = true;
    }
    const next = $('#q-next');
    next.textContent = quiz.round >= ROUNDS ? '결과 보기 →' : '다음 문제 →';
    next.classList.remove('hidden');
    next.focus();
  }

  $('#q-form').addEventListener('submit', (e) => { e.preventDefault(); answer($('#q-input').value); });
  $('#q-next').addEventListener('click', nextQuestion);
  $('#q-hint').addEventListener('click', () => {
    quiz.hinted = true;
    $('#q-hint-text').textContent = choseong(quiz.q.answer);
    $('#q-hint').disabled = true;
    if (usesTyping()) $('#q-input').focus();
  });
  $('#start-quiz').addEventListener('click', () => startQuiz('blank'));
  $('#start-transfer').addEventListener('click', () => startQuiz('transfer'));

  function endQuiz() {
    const key = quiz.mode === 'transfer' ? 'bestTransfer' : 'bestQuiz';
    const best = store.get(key, 0);
    const isBest = quiz.score > best;
    if (isBest) store.set(key, quiz.score);
    const correct = quiz.log.filter((l) => l.ok).length;
    $('#r-title').textContent = isBest ? '🎉 최고 기록!' : (quiz.mode === 'transfer' ? '환승역 퀴즈 결과' : '빈칸 퀴즈 결과');
    $('#r-score').textContent = quiz.score + '점';
    $('#r-detail').textContent = `${quiz.log.length}문제 중 ${correct}개 정답`;
    const review = $('#r-review');
    review.innerHTML = '';
    quiz.log.forEach(({ q, given, ok }) => {
      const row = document.createElement('div');
      row.className = 'review-item ' + (ok ? 'ok' : 'no');
      row.innerHTML = `<span class="mark">${ok ? '○' : '✕'}</span><span class="badges"></span><b></b><span class="muted"></span>`;
      [q.line, q.lineB].filter(Boolean).forEach((ln) => {
        const s = document.createElement('span');
        s.className = 'line-badge mini';
        applyBadge(s, ln);
        row.querySelector('.badges').appendChild(s);
      });
      row.querySelector('b').textContent = q.answer;
      if (!ok) row.querySelector('.muted').textContent = given ? `(내 답: ${given})` : '';
      review.appendChild(row);
    });
    $('#r-again').onclick = () => startQuiz(quiz.mode);
    show('result');
  }

  renderHome();
  heroTrain();

  // 앱 설치·오프라인 지원 (웹 서버로 열었을 때만 동작)
  // 새 버전이 설치되면 한 번 자동 새로고침해서 예전 파일과 섞이지 않게 함
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  }
})();
