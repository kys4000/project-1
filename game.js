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
  const lineById = Object.fromEntries(LINES.map((l) => [l.id, l]));
  // 순환선 첫 구간은 마지막 중복 역 제거
  const segOf = (line, i) => (line.circular && i === 0 ? line.segments[0].slice(0, -1) : line.segments[i]);
  const stationsOf = (line) => [...new Set(line.segments.flat())];

  function setLineColor(el, line) { el.style.setProperty('--c', line.color); }

  // ---------- 화면 전환 ----------
  function show(id) {
    $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
    window.scrollTo(0, 0);
  }
  $$('[data-home]').forEach((b) => b.addEventListener('click', () => { stopTimer(); renderHome(); show('home'); }));

  // ---------- 홈 ----------
  let quizLines = new Set(store.get('quizLines', LINES.map((l) => l.id)));
  let answerMode = store.get('answerMode', 'choice');

  function renderHome() {
    const picker = $('#quiz-lines');
    picker.innerHTML = '';
    LINES.forEach((line) => {
      const b = document.createElement('button');
      b.className = 'line-chip' + (quizLines.has(line.id) ? '' : ' off');
      b.textContent = line.id;
      b.title = line.name;
      setLineColor(b, line);
      b.addEventListener('click', () => {
        if (quizLines.has(line.id)) { if (quizLines.size > 1) quizLines.delete(line.id); }
        else quizLines.add(line.id);
        store.set('quizLines', [...quizLines]);
        renderHome();
      });
      picker.appendChild(b);
    });

    $$('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.answer === answerMode));

    const best = store.get('bestQuiz', null);
    $('#best-quiz').textContent = best != null ? `최고 점수 ${best}점` : '';

    const grid = $('#conquer-lines');
    grid.innerHTML = '';
    LINES.forEach((line) => {
      const total = stationsOf(line).length;
      const best = store.get('bestConquer:' + line.id, 0);
      const b = document.createElement('button');
      b.className = 'line-card';
      setLineColor(b, line);
      b.style.setProperty('--p', best / total);
      b.innerHTML = `<span class="line-badge">${line.id}</span>
        <span><b>${line.name}</b><small>${total}개 역 · <span class="best-mini">${best ? `최고 ${best}/${total}` : '도전 전'}</span></small></span>`;
      b.addEventListener('click', () => startConquer(line));
      grid.appendChild(b);
    });
  }

  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    answerMode = b.dataset.answer;
    store.set('answerMode', answerMode);
    renderHome();
  }));

  // ---------- 빈칸 퀴즈 ----------
  const ROUNDS = 10;
  const quiz = { round: 0, score: 0, q: null, hinted: false, answered: false, used: new Set(), log: [] };

  function makeQuestion() {
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
      return { line, answer, prev2: at(i - 2), prev: at(i - 1), next: at(i + 1), next2: at(i + 2) };
    }
    return null;
  }

  function startQuiz() {
    Object.assign(quiz, { round: 0, score: 0, used: new Set(), log: [] });
    show('quiz');
    nextQuestion();
  }

  function nextQuestion() {
    if (quiz.round >= ROUNDS) return endQuiz();
    const q = makeQuestion();
    if (!q) return endQuiz();
    quiz.q = q; quiz.round++; quiz.hinted = false; quiz.answered = false;
    quiz.used.add(q.answer);

    const card = $('.question');
    setLineColor($('#quiz'), q.line);
    card.classList.remove('shake');
    renderDots();
    $('#q-badge').textContent = q.line.id;
    $('#q-round').textContent = quiz.round;
    $('#q-score').textContent = quiz.score;
    $('#q-feedback').textContent = '';
    $('#q-feedback').className = 'feedback';
    $('#q-hint-text').textContent = '';
    $('#q-hint').disabled = false;
    $('#q-next').classList.add('hidden');

    renderTrack(false);

    const choices = $('#q-choices');
    const form = $('#q-form');
    choices.innerHTML = '';
    if (answerMode === 'choice') {
      choices.classList.remove('hidden');
      form.classList.add('hidden');
      const exclude = new Set([q.answer, q.prev, q.next]);
      const pool = shuffle(stationsOf(q.line).filter((s) => !exclude.has(s)));
      shuffle([q.answer, ...pool.slice(0, 3)]).forEach((s) => {
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

  // 역 표지판: ◀ 이전역 | [ 이 역 ] | 다음역 ▶
  function renderTrack(solved) {
    const q = quiz.q;
    const sign = $('#q-track');
    sign.innerHTML = `
      <div class="sign-side left"><small></small><b></b><span class="gap"></span></div>
      <div class="sign-center ${solved ? 'solved' : 'unknown'}"><small></small><strong></strong></div>
      <div class="sign-side right"><small></small><b></b><span class="gap"></span></div>`;
    const [l, r] = sign.querySelectorAll('.sign-side');
    l.querySelector('small').textContent = q.prev2 ? `${q.prev2} ·` : '';
    l.querySelector('b').textContent = `◀ ${q.prev}`;
    r.querySelector('small').textContent = q.next2 ? `· ${q.next2}` : '';
    r.querySelector('b').textContent = `${q.next} ▶`;
    sign.querySelector('.sign-center small').textContent = q.line.name;
    sign.querySelector('.sign-center strong').textContent = solved ? q.answer : '?';
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
  function burst(el, color) {
    const fx = $('#fx');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const colors = [color, '#ffffff', '#ffd23f', color];
    for (let i = 0; i < 22; i++) {
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
    if (answerMode === 'type' && !ok && !given.trim()) return;
    quiz.answered = true;
    const pts = ok ? (quiz.hinted ? 5 : 10) : 0;
    quiz.score += pts;
    quiz.log.push({ line: q.line, answer: q.answer, given, ok });

    $('#q-score').textContent = quiz.score;
    $('#q-hint').disabled = true;
    const fb = $('#q-feedback');
    fb.className = 'feedback ' + (ok ? 'good' : 'bad');
    fb.textContent = ok ? `정답! +${pts}점` : `아쉬워요. 정답은 "${q.answer}"`;
    renderTrack(true);
    renderDots();
    const card = $('.question');
    if (ok) burst($('#q-track .sign-center'), q.line.color);
    else { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }

    if (answerMode === 'choice') {
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
    next.textContent = quiz.round >= ROUNDS ? '결과 보기 →' : '다음 역 →';
    next.classList.remove('hidden');
    next.focus();
  }

  $('#q-form').addEventListener('submit', (e) => { e.preventDefault(); answer($('#q-input').value); });
  $('#q-next').addEventListener('click', nextQuestion);
  $('#q-hint').addEventListener('click', () => {
    quiz.hinted = true;
    $('#q-hint-text').textContent = choseong(quiz.q.answer);
    $('#q-hint').disabled = true;
    if (answerMode === 'type') $('#q-input').focus();
  });
  $('#start-quiz').addEventListener('click', startQuiz);

  function endQuiz() {
    const best = store.get('bestQuiz', 0);
    const isBest = quiz.score > best;
    if (isBest) store.set('bestQuiz', quiz.score);
    const correct = quiz.log.filter((l) => l.ok).length;
    $('#r-title').textContent = isBest ? '🎉 최고 기록!' : '결과';
    $('#r-score').textContent = quiz.score + '점';
    $('#r-detail').textContent = `${quiz.log.length}문제 중 ${correct}개 정답`;
    const review = $('#r-review');
    review.innerHTML = '';
    quiz.log.forEach((l) => {
      const row = document.createElement('div');
      row.className = 'review-item ' + (l.ok ? 'ok' : 'no');
      row.innerHTML = `<span class="mark">${l.ok ? '○' : '✕'}</span><span class="line-badge mini">${l.line.id}</span><b></b><span class="muted"></span>`;
      setLineColor(row.querySelector('.line-badge'), l.line);
      row.querySelector('b').textContent = l.answer;
      if (!l.ok) row.querySelector('.muted').textContent = l.given ? `(내 답: ${l.given})` : '';
      review.appendChild(row);
    });
    $('#r-again').onclick = startQuiz;
    show('result');
  }

  // ---------- 노선 정복 ----------
  const SEC_PER_STATION = 8;
  const con = { line: null, found: new Set(), stations: [], left: 0, timer: null, over: false };

  function stopTimer() { clearInterval(con.timer); con.timer = null; }

  function startConquer(line) {
    stopTimer();
    con.line = line;
    con.stations = stationsOf(line);
    con.found = new Set();
    con.over = false;
    con.left = Math.max(120, con.stations.length * SEC_PER_STATION);

    const sec = $('#conquer');
    setLineColor(sec, line);
    $('#c-badge').textContent = line.id;
    $('#c-total').textContent = con.stations.length;
    $('#c-msg').textContent = '';
    $('#c-msg').className = 'feedback';
    $('#c-giveup').textContent = '포기';

    const board = $('#c-board');
    board.innerHTML = '';
    line.segments.forEach((_, i) => {
      const row = document.createElement('div');
      row.className = 'board-seg';
      segOf(line, i).forEach((name) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.name = name;
        cell.textContent = name;
        row.appendChild(cell);
      });
      board.appendChild(row);
    });

    const input = $('#c-input');
    input.value = '';
    input.disabled = false;
    updateConquer();
    show('conquer');
    input.focus();
    con.timer = setInterval(() => {
      con.left--;
      updateConquer();
      if (con.left <= 0) endConquer('시간 종료!');
    }, 1000);
  }

  function updateConquer() {
    const m = Math.floor(con.left / 60), s = con.left % 60;
    const t = $('#c-timer');
    t.textContent = `${m}:${String(s).padStart(2, '0')}`;
    t.classList.toggle('warn', con.left <= 15);
    $('#c-found').textContent = con.found.size;
    $('#c-bar').style.width = (con.found.size / con.stations.length) * 100 + '%';
  }

  function matchStation(text) {
    const n = norm(text);
    if (!n) return null;
    return con.stations.find((s) => acceptedNames(s).includes(n)) || null;
  }

  // 다른 미발견 역 이름의 앞부분이면(예: 잠실 → 잠실나루) 자동 확정하지 않음
  function isPrefixOfOther(text, station) {
    const n = norm(text);
    return con.stations.some((s) => s !== station && !con.found.has(s) && acceptedNames(s).some((a) => a.length > n.length && a.startsWith(n)));
  }

  function tryInput(force) {
    if (con.over) return;
    const input = $('#c-input');
    const st = matchStation(input.value);
    const msg = $('#c-msg');
    if (st && !con.found.has(st)) {
      if (!force && isPrefixOfOther(input.value, st)) return;
      con.found.add(st);
      let firstCell = null;
      $$(`#c-board .cell`).forEach((c) => { if (c.dataset.name === st) { c.classList.add('found'); firstCell = firstCell || c; } });
      if (firstCell) burst(firstCell, con.line.color);
      input.value = '';
      msg.className = 'feedback good';
      msg.textContent = `${st} ✓`;
      updateConquer();
      if (con.found.size === con.stations.length) endConquer('🎉 전부 맞혔어요!');
    } else if (force) {
      msg.className = 'feedback bad';
      msg.textContent = st ? `${st}은(는) 이미 찾았어요` : `"${input.value.trim()}"은(는) ${con.line.name}에 없어요`;
      if (!input.value.trim()) msg.textContent = '';
      input.select();
    }
  }

  $('#c-input').addEventListener('input', (e) => { if (!e.isComposing) tryInput(false); });
  $('#c-form').addEventListener('submit', (e) => { e.preventDefault(); tryInput(true); });
  $('#c-giveup').addEventListener('click', () => {
    if (con.over) startConquer(con.line); else endConquer('포기했어요.');
  });

  function endConquer(reason) {
    stopTimer();
    con.over = true;
    $$('#c-board .cell').forEach((c) => { if (!con.found.has(c.dataset.name)) c.classList.add('missed'); });
    const input = $('#c-input');
    input.disabled = true;
    const key = 'bestConquer:' + con.line.id;
    const best = store.get(key, 0);
    if (con.found.size > best) store.set(key, con.found.size);
    const msg = $('#c-msg');
    msg.className = 'feedback';
    msg.textContent = `${reason} ${con.stations.length}개 중 ${con.found.size}개 성공` + (con.found.size > best ? ' · 최고 기록!' : '');
    $('#c-giveup').textContent = '다시 하기';
  }

  renderHome();

  // 앱 설치·오프라인 지원 (웹 서버로 열었을 때만 동작)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
