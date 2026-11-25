/* Fuga do Calabouço — jogo secreto do catálogo (código CAT-009)
   Plataforma clássica no estilo dos jogos de 1989. Abre ao digitar game1337.
   Personagens, nome e desenhos originais. */
(function(){
"use strict";
if (window.abrirJogo) return;

// ---------- Medidas e física ----------
const TW = 64, RH = 126, COLS = 10, ROWS = 3, W = TW * COLS, H = RH * ROWS, HUD = 34;
const G = 0.45, RUN = 3.2, STEP = 1.1, FIGHT = 1.3, JUMP = -7, HALF = 12;
const TEMPO_TOTAL = 15 * 60; // segundos

// Legenda: . vazio  # chão  W parede  ^ espinhos  L chão solto  P placa  G portão
//          E saída  H poção  g guarda  s início
const NIVEIS = [
  { nome: "O calabouço", parry: 0.3, cd: [70, 120], mapa: [
    "W.....####" + "#####.####" + "####...##W",
    "Ws##.####." + ".LL##P#g#G" + "H#^^^##.#E",
    "W#########" + "###.######" + "W########W"
  ]},
  { nome: "A torre", parry: 0.45, cd: [50, 95], mapa: [
    "W..######." + "..####...." + "####L#####" + "#####...WW",
    "Ws##..L##." + "#g####P#G#" + "H^^#.##g##" + "#..L###EWW",
    "W#########" + "########W#" + "#########." + "##########"
  ]}
];

// ---------- Estado ----------
let ov, cv, cx, raf = 0, aberto = false, acum = 0, ultimo = 0;
let tiles, nivel = 0, P, guardas, soltos, entulho, detritos, portaoT, portao, tempo, msg, msgT, estado, quadro, introT;
const keys = {}, novos = new Set();

const col = x => Math.floor(x / TW);
const linha = y => Math.floor((y - 10) / RH);
const S = r => (r + 1) * RH - 8; // altura dos pés em pé na linha r
function T(c, r){
  if (r < 0) return "W";
  if (r >= tiles.length) return ".";
  if (c < 0 || c >= tiles[0].length) return "W";
  return tiles[r][c];
}
const temChao = ch => "#^LPGEHgs".includes(ch);
const solido = ch => ch === "W" || (ch === "G" && portao < 0.7);
const apoio = (c, r) => temChao(T(c, r)) || T(c, r + 1) === "W";
function apertou(k){ if (novos.has(k)) { novos.delete(k); return true; } return false; }
function aviso(t, dur){ msg = t; msgT = dur || 120; }

// ---------- Início de nível ----------
function carregaNivel(n){
  nivel = n;
  const N = NIVEIS[n];
  tiles = N.mapa.map(l => l.split(""));
  guardas = []; soltos = {}; entulho = []; detritos = [];
  portaoT = 0; portao = 0; quadro = 0; introT = 150;
  let sx = 1, sy = 1;
  tiles.forEach((l, r) => l.forEach((ch, c) => {
    if (ch === "s") { sx = c; sy = r; l[c] = "#"; }
    if (ch === "g") {
      l[c] = "#";
      guardas.push({ x: c * TW + TW / 2, y: S(r), face: -1, hp: 3, max: 3, estado: "normal", t: 0, parry: 0, cd: 60, fase: 0, vx: 0 });
    }
  }));
  P = { x: sx * TW + TW / 2, y: S(sy), vx: 0, vy: 0, face: 1, chao: true, hp: 3, max: 3,
        quedaY: 0, seguro: false, estado: "normal", t: 0, parry: 0, fase: 0 };
  estado = "jogando";
  aviso("Nível " + (n + 1) + ": " + N.nome, 150);
}
function novoJogo(){ tempo = TEMPO_TOTAL * 60; carregaNivel(0); }

// ---------- Jogador ----------
function morre(motivo){
  if (P.estado === "morto") return;
  P.estado = "morto"; P.t = 0; P.hp = 0; P.vx = 0;
  aviso(motivo, 9999);
  estado = "morto";
}

function guardaEngajado(){
  if (P.estado === "morto") return null;
  const rp = linha(P.y), sala = Math.floor(P.x / W);
  let melhor = null;
  guardas.forEach(g => {
    if (g.estado === "morto" || linha(g.y) !== rp || Math.floor(g.x / W) !== sala) return;
    const d = Math.abs(g.x - P.x);
    if (d < 300 && (!melhor || d < Math.abs(melhor.x - P.x))) melhor = g;
  });
  return melhor;
}

function tentaSubir(){
  const c = col(P.x), r = linha(P.y), a = c + P.face;
  if (r <= 0) return false;
  const acima = T(c, r - 1);
  if (temChao(acima) || acima === "W") return false;
  if (!apoio(a, r - 1) || solido(T(a, r - 1))) return false;
  const borda = P.face > 0 ? (c + 1) * TW : c * TW;
  P.estado = "subindo"; P.t = 0;
  P.ox = P.x; P.oy = P.y; P.ax = borda + P.face * 18; P.ay = S(r - 1);
  P.vx = 0; P.vy = 0;
  return true;
}

function desceBorda(){
  const c = col(P.x), r = linha(P.y), a = c + P.face;
  if (apoio(a, r) || solido(T(a, r))) return;
  P.x = (P.face > 0 ? (c + 1) * TW : c * TW) + P.face * 16;
  P.seguro = true;
}

function golpe(atk, def, chanceParry){
  if (!def || def.estado === "morto" || (def === P && P.estado === "morto")) return;
  const d = Math.abs(def.x - atk.x);
  if (d > 90 || Math.sign(def.x - atk.x) !== atk.face) return;
  const defende = def.parry > 0 || (def !== P && def.estado === "normal" && Math.random() < chanceParry);
  if (defende) {
    def.parry = 10; atk.estado = "atingido"; atk.t = 6;
    aviso("Bloqueado!", 40);
    return;
  }
  def.hp--;
  def.estado = "atingido"; def.t = 0;
  const nx = def.x + atk.face * 14;
  if (!solido(T(col(nx + atk.face * HALF), linha(def.y)))) def.x = nx;
  if (def.hp <= 0) {
    if (def === P) morre("O guarda venceu. Enter para tentar de novo.");
    else { def.estado = "morto"; def.t = 0; aviso("Guarda derrotado!", 90); }
  }
}

function atualizaJogador(){
  const p = P;
  if (p.estado === "morto") { p.t++; return; }
  if (p.estado === "subindo") {
    p.t++;
    const k = Math.min(1, p.t / 26);
    p.y = p.oy + (p.ay - p.oy) * Math.min(1, k / 0.6);
    p.x = p.ox + (p.ax - p.ox) * Math.max(0, (k - 0.5) / 0.5);
    if (p.t >= 26) { p.estado = "normal"; p.chao = true; }
    return;
  }
  const g = guardaEngajado();
  const esq = keys.ArrowLeft, dir = keys.ArrowRight, cuidado = keys.Shift;
  if (p.parry > 0) p.parry--;

  if (p.estado === "atacando") {
    p.t++; p.vx = 0;
    if (p.t === 12 && g) golpe(p, g, NIVEIS[nivel].parry);
    if (p.t >= 26) p.estado = "normal";
  } else if (p.estado === "atingido") {
    p.t++; p.vx = 0;
    if (p.t >= 18) p.estado = "normal";
  } else if (p.chao) {
    if (g) {
      p.face = Math.sign(g.x - p.x) || p.face;
      p.vx = (dir ? FIGHT : 0) - (esq ? FIGHT : 0);
      if (apertou("ArrowUp")) p.parry = 16;
      if (apertou(" ")) { p.estado = "atacando"; p.t = 0; p.vx = 0; }
    } else {
      const v = cuidado ? STEP : RUN;
      if (dir) { p.vx = v; p.face = 1; } else if (esq) { p.vx = -v; p.face = -1; } else p.vx = 0;
      if (cuidado && p.vx && !apoio(col(p.x + p.vx + p.face * 10), linha(p.y))) p.vx = 0;
      if (apertou(" ")) { p.estado = "atacando"; p.t = 0; p.vx = 0; }
      else if (apertou("ArrowUp")) {
        if (T(col(p.x), linha(p.y)) === "E") return proximoNivel();
        if (!tentaSubir()) { p.vy = JUMP; p.chao = false; p.quedaY = p.y; if (p.vx) p.vx = p.face * 4; }
      } else if (apertou("ArrowDown")) desceBorda();
    }
  }
  fisica(p);
  if (p.estado === "morto") return;

  // Coisas do chão onde está pisando
  if (p.chao) {
    const c = col(p.x), r = linha(p.y), ch = T(c, r);
    if (ch === "^" && Math.abs(p.vx) > STEP + 0.05) morre("Espinhos! Ande com cuidado (Shift). Enter para tentar de novo.");
    if (ch === "L" && !(c + "," + r in soltos)) soltos[c + "," + r] = 28;
    if (ch === "P") { if (portaoT <= 0) aviso("Um portão se abriu!", 90); portaoT = 15 * 60; }
    if (ch === "H") { tiles[r][c] = "#"; p.hp = Math.min(p.max, p.hp + 1); aviso("Poção: +1 de vida", 90); }
  }
  if (p.y > tiles.length * RH + 250) morre("Você caiu no abismo. Enter para tentar de novo.");
}

function fisica(p){
  if (p.vx) {
    const nx = p.x + p.vx, r = linha(p.y), frente = col(nx + Math.sign(p.vx) * HALF);
    if (solido(T(frente, r))) {
      p.x = p.vx > 0 ? frente * TW - HALF - 0.01 : (frente + 1) * TW + HALF + 0.01;
      p.vx = 0;
    } else p.x = nx;
  }
  if (p.chao) {
    if (!apoio(col(p.x), linha(p.y))) {
      p.chao = false; p.vy = 0;
      p.quedaY = p.y + (p.seguro ? RH : 0);
      p.seguro = false;
    }
    return;
  }
  p.vy = Math.min(p.vy + G, 14);
  const ny = p.y + p.vy;
  if (p.vy > 0) {
    for (let r = linha(p.y); r <= linha(ny) + 1; r++) {
      const s = S(r);
      if (s > p.y - 0.01 && s <= ny && apoio(col(p.x), r)) { aterrissa(p, s, r); return; }
    }
  }
  p.y = ny;
}

function aterrissa(p, s, r){
  p.y = s; p.vy = 0; p.chao = true;
  const linhas = Math.round((s - p.quedaY) / RH);
  if (linhas >= 1) p.vx = 0;
  if (T(col(p.x), r) === "^") return morre("Espinhos! Enter para tentar de novo.");
  if (linhas >= 3) return morre("Queda alta demais. Enter para tentar de novo.");
  if (linhas === 2) {
    p.hp--; p.estado = "atingido"; p.t = 0;
    if (p.hp <= 0) return morre("Queda alta demais. Enter para tentar de novo.");
    aviso("Ai! Use ↓ na borda para descer com segurança.", 120);
  }
}

// ---------- Guardas ----------
function atualizaGuardas(){
  const engajado = guardaEngajado();
  guardas.forEach(g => {
    if (g.parry > 0) g.parry--;
    if (g.estado === "morto") { g.t++; return; }
    if (g.estado === "atingido") { g.t++; if (g.t >= 18) g.estado = "normal"; return; }
    if (g.estado === "atacando") {
      g.t++;
      if (g.t === 14) golpe(g, P, 0);
      if (g.t >= 28) g.estado = "normal";
      return;
    }
    if (g !== engajado || P.estado === "morto") { g.vx = 0; return; }
    g.face = Math.sign(P.x - g.x) || g.face;
    const d = Math.abs(P.x - g.x);
    let v = 0;
    if (d > 78) v = 1.0 * g.face; else if (d < 44) v = -0.8 * g.face;
    const nx = g.x + v, r = linha(g.y), c2 = col(nx + Math.sign(v) * HALF);
    if (v && apoio(col(nx), r) && !solido(T(c2, r))) g.x = nx;
    g.vx = v;
    g.cd--;
    if (g.cd <= 0 && d < 88 && P.estado !== "subindo") {
      const [a, b] = NIVEIS[nivel].cd;
      g.estado = "atacando"; g.t = 0; g.cd = a + Math.random() * (b - a);
    }
  });
}

// ---------- Chão solto, portão, tempo ----------
function atualizaMundo(){
  Object.keys(soltos).forEach(k => {
    soltos[k]--;
    if (soltos[k] <= 0) {
      const [c, r] = k.split(",").map(Number);
      delete soltos[k];
      if (tiles[r][c] === "L") {
        tiles[r][c] = ".";
        detritos.push({ x: c * TW + TW / 2, y: S(r), vy: 0, c });
      }
    }
  });
  detritos = detritos.filter(d => {
    d.vy = Math.min(d.vy + G, 12);
    const ny = d.y + d.vy;
    for (let r = linha(d.y); r <= linha(ny) + 1; r++) {
      const s = S(r);
      if (s > d.y && s <= ny && apoio(d.c, r)) { entulho.push({ x: d.x, y: s }); return false; }
    }
    d.y = ny;
    return d.y < tiles.length * RH + 200;
  });
  if (portaoT > 0) portaoT--;
  portao = Math.max(0, Math.min(1, portao + (portaoT > 0 ? 0.03 : -0.012)));
  // Portão fechando em cima de alguém: empurra para fora
  if (portao < 0.7 && T(col(P.x), linha(P.y)) === "G") P.x = col(P.x) * TW - HALF - 1;

  if (estado === "jogando") {
    tempo--;
    if (tempo % 3600 === 0 && tempo > 0) aviso(Math.round(tempo / 3600) + " minutos restantes", 150);
    if (tempo <= 0) { estado = "fimTempo"; aviso("O tempo acabou! Enter para jogar de novo.", 9999); }
  }
}

function proximoNivel(){
  if (nivel + 1 < NIVEIS.length) {
    const hp = P.hp, max = P.max;
    carregaNivel(nivel + 1);
    P.hp = hp; P.max = max;
  } else {
    estado = "venceu";
    const m = Math.floor(tempo / 3600), s = Math.floor(tempo / 60) % 60;
    aviso("Você escapou! Sobraram " + m + " min " + s + " s. Enter para jogar de novo.", 9999);
  }
}

function passo(){
  quadro++;
  if (msgT > 0 && msgT < 9999) msgT--;
  if (estado === "titulo") { if (apertou("Enter") || apertou(" ")) novoJogo(); return; }
  if (estado === "morto") {
    atualizaJogador(); atualizaGuardas(); atualizaMundo();
    if (P.t > 40 && apertou("Enter")) { const t = tempo; carregaNivel(nivel); tempo = t; }
    return;
  }
  if (estado === "venceu" || estado === "fimTempo") { if (apertou("Enter")) novoJogo(); return; }
  if (apertou("r") || apertou("R")) { const t = tempo; carregaNivel(nivel); tempo = t; return; }
  atualizaJogador(); atualizaGuardas(); atualizaMundo();
}

// ---------- Desenho ----------
const COR = {
  fundo: "#0d1422", tijolo: "#172235", junta: "#0f1828",
  parede: "#3a4a66", paredeEsc: "#2a3750", paredeLuz: "#5a6c8c",
  chao: "#a8916a", chaoFrente: "#6e5c41", chaoSolto: "#8f7a58"
};

function desenhaFundo(ox, oy){
  cx.fillStyle = COR.fundo; cx.fillRect(0, 0, W, H);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const gc = ox + c, gr = oy + r, x = c * TW, y = r * RH;
    if (T(gc, gr) === "W") continue;
    cx.fillStyle = COR.tijolo;
    for (let i = 0; i < 5; i++) {
      const by = y + 8 + i * 24, desl = (i + gc) % 2 ? 0 : 16;
      for (let bx = x - desl; bx < x + TW; bx += 32) {
        cx.fillRect(Math.max(x, bx + 1), by, Math.min(30, x + TW - bx - 1, bx + 31 - x), 20);
      }
    }
    if ((gc * 7 + gr * 3) % 11 === 0 && !temChao(T(gc, gr - 1))) tocha(x + TW / 2, y + 40);
  }
}

function tocha(x, y){
  cx.fillStyle = "#4b3a28"; cx.fillRect(x - 3, y, 6, 18);
  const f = Math.sin(quadro * 0.3 + x) * 2;
  const g = cx.createRadialGradient(x, y - 4, 1, x, y - 4, 40);
  g.addColorStop(0, "rgba(255,180,80,0.35)"); g.addColorStop(1, "rgba(255,180,80,0)");
  cx.fillStyle = g; cx.fillRect(x - 40, y - 44, 80, 80);
  cx.fillStyle = "#ffb347";
  cx.beginPath(); cx.moveTo(x - 6, y); cx.quadraticCurveTo(x + f, y - 22, x + 6, y); cx.fill();
  cx.fillStyle = "#fff1a8";
  cx.beginPath(); cx.moveTo(x - 3, y); cx.quadraticCurveTo(x + f / 2, y - 11, x + 3, y); cx.fill();
}

function desenhaTiles(ox, oy){
  for (let r = -1; r <= ROWS; r++) for (let c = 0; c < COLS; c++) {
    const gc = ox + c, gr = oy + r, ch = T(gc, gr), x = c * TW, y = r * RH;
    if (ch === "W" && r >= 0 && r < ROWS) {
      cx.fillStyle = COR.parede; cx.fillRect(x, y - 8, TW, RH + 8);
      cx.fillStyle = COR.paredeEsc;
      for (let i = 0; i < 5; i++) cx.fillRect(x, y - 8 + i * 27 + 25, TW, 3);
      for (let i = 0; i < 5; i++) cx.fillRect(x + ((i % 2) ? 20 : 44), y - 8 + i * 27, 3, 25);
      cx.fillStyle = COR.paredeLuz; cx.fillRect(x, y - 8, TW, 4);
      continue;
    }
    if (!temChao(ch)) continue;
    const s = S(r) - oy * 0, fy = (r + 1) * RH - 8;
    if (ch === "E") porta(x, r * RH);
    let tremor = 0;
    if (ch === "L" && (gc + "," + gr) in soltos) tremor = Math.sin(quadro * 2) * 1.5;
    cx.fillStyle = ch === "L" ? COR.chaoSolto : COR.chao;
    cx.fillRect(x + 1, fy + tremor, TW - 2, 6);
    cx.fillStyle = COR.chaoFrente; cx.fillRect(x + 1, fy + 6 + tremor, TW - 2, 8);
    if (ch === "L") { cx.fillStyle = "#3d3225"; cx.fillRect(x + 22, fy + 1 + tremor, 2, 10); cx.fillRect(x + 40, fy + 3 + tremor, 2, 8); }
    if (ch === "^") {
      cx.fillStyle = "#c9d2dc";
      for (let i = 0; i < 5; i++) {
        const bx = x + 6 + i * 12;
        cx.beginPath(); cx.moveTo(bx, fy); cx.lineTo(bx + 5, fy - 16); cx.lineTo(bx + 10, fy); cx.fill();
      }
    }
    if (ch === "P") {
      cx.fillStyle = portaoT > 0 ? "#6d6a5e" : "#d8c9a0";
      cx.fillRect(x + 14, fy - (portaoT > 0 ? 1 : 4), TW - 28, 4);
    }
    if (ch === "H") pocao(x + TW / 2, fy);
    if (ch === "G") {
      const alto = (RH - 10) * (1 - portao * 0.85);
      cx.fillStyle = "#1c1c22"; cx.fillRect(x + TW / 2 - 10, r * RH, 20, alto);
      cx.fillStyle = "#7c7f88";
      for (let i = 0; i < 4; i++) cx.fillRect(x + TW / 2 - 9 + i * 6, r * RH, 3, alto);
      cx.fillRect(x + TW / 2 - 11, r * RH + alto - 4, 22, 4);
    }
  }
  entulho.forEach(e => {
    cx.fillStyle = "#6e5c41";
    const x = e.x - ox * TW, y = e.y - oy * RH;
    cx.fillRect(x - 18, y - 4, 10, 4); cx.fillRect(x - 4, y - 6, 12, 6); cx.fillRect(x + 12, y - 3, 8, 3);
  });
  detritos.forEach(d => {
    cx.fillStyle = COR.chaoSolto;
    cx.fillRect(d.x - ox * TW - TW / 2 + 1, d.y - oy * RH, TW - 2, 12);
  });
}

function porta(x, y){
  cx.fillStyle = "#c79a3b"; cx.fillRect(x + 8, y + 18, TW - 16, RH - 26);
  cx.beginPath(); cx.arc(x + TW / 2, y + 30, TW / 2 - 8, Math.PI, 0); cx.fill();
  cx.fillStyle = "#05070c"; cx.fillRect(x + 14, y + 30, TW - 28, RH - 38);
  cx.beginPath(); cx.arc(x + TW / 2, y + 30, TW / 2 - 14, Math.PI, 0); cx.fill();
  cx.fillStyle = "#c79a3b";
  for (let i = 0; i < 4; i++) cx.fillRect(x + 16 + i * 2, y + RH - 18 - i * 14, TW - 32 - i * 4, 3);
}

function pocao(x, y){
  cx.fillStyle = "rgba(255,60,80,0.25)";
  cx.beginPath(); cx.arc(x, y - 10, 14 + Math.sin(quadro * 0.1) * 2, 0, 7); cx.fill();
  cx.fillStyle = "#e23b4f"; cx.beginPath(); cx.arc(x, y - 8, 7, 0, 7); cx.fill();
  cx.fillStyle = "#cfd6e0"; cx.fillRect(x - 2, y - 22, 4, 9);
  cx.fillStyle = "#fff"; cx.fillRect(x - 3, y - 11, 2, 2);
}

// Boneco: x,y são os pés
function boneco(o, cores, ox, oy, comEspada){
  const x = o.x - ox * TW, y = o.y - oy * RH, f = o.face;
  cx.save(); cx.translate(x, y);
  if (o.estado === "morto") {
    cx.rotate(f * -Math.PI / 2 * Math.min(1, o.t / 20));
  }
  const andando = Math.abs(o.vx || 0) > 0.1 || (o.chao === false);
  o.fase = (o.fase || 0) + Math.abs(o.vx || 0) * 0.12;
  const perna = andando ? Math.sin(o.fase) * 10 : 0;
  // pernas
  cx.strokeStyle = cores.calca; cx.lineWidth = 6; cx.lineCap = "round";
  cx.beginPath(); cx.moveTo(0, -30); cx.lineTo(perna, -2); cx.moveTo(0, -30); cx.lineTo(-perna, -2); cx.stroke();
  // corpo
  cx.fillStyle = cores.roupa;
  cx.beginPath(); cx.moveTo(-10, -30); cx.lineTo(10, -30); cx.lineTo(8, -58); cx.lineTo(-8, -58); cx.closePath(); cx.fill();
  cx.fillStyle = cores.cinto; cx.fillRect(-10, -34, 20, 4);
  // cabeça
  cx.fillStyle = cores.pele; cx.beginPath(); cx.arc(f * 2, -66, 8, 0, 7); cx.fill();
  cx.fillStyle = cores.cabeca;
  if (cores.capuz) { cx.beginPath(); cx.arc(f * 1, -67, 9.5, Math.PI * (f > 0 ? 0.55 : -0.45), Math.PI * (f > 0 ? 2.15 : 1.15)); cx.fill(); cx.fillRect(-8 * f - (f > 0 ? 2 : -2), -66, 4, 14); }
  else { cx.fillRect(-9, -76, 18, 7); cx.fillRect(-10, -70, 20, 3); }
  cx.fillStyle = "#111"; cx.fillRect(f * 5 - 1, -68, 2, 2);
  // braço e espada
  let ang = 0.6;
  if (o.estado === "atacando") ang = o.t < 10 ? 1.4 : (o.t < 16 ? -0.1 : 0.4);
  if (o.parry > 0) ang = 1.9;
  const mx = f * 12, my = -48;
  cx.strokeStyle = cores.pele; cx.lineWidth = 4;
  cx.beginPath(); cx.moveTo(0, -54); cx.lineTo(mx, my); cx.stroke();
  if (comEspada) {
    const len = 34, ex = mx + f * Math.cos(ang - 0.6) * len, ey = my - Math.sin(ang - 0.6) * len;
    cx.strokeStyle = "#dfe6ee"; cx.lineWidth = 2.5;
    cx.beginPath(); cx.moveTo(mx, my); cx.lineTo(ex, ey); cx.stroke();
    cx.strokeStyle = "#c79a3b"; cx.lineWidth = 3;
    cx.beginPath(); cx.moveTo(mx - 4, my + 3); cx.lineTo(mx + 4, my - 3); cx.stroke();
  }
  cx.restore();
}

function triangulos(n, max, x, dir, cor){
  for (let i = 0; i < max; i++) {
    const bx = x + dir * i * 16;
    cx.fillStyle = i < n ? cor : "#3a2a2a";
    cx.beginPath(); cx.moveTo(bx, H + 25); cx.lineTo(bx + 6, H + 11); cx.lineTo(bx + 12, H + 25); cx.fill();
  }
}

function desenha(){
  cx.clearRect(0, 0, W, H + HUD);
  if (estado === "titulo") return telaTitulo();
  const ox = Math.floor(P.x / W) * COLS, oy = Math.max(0, linha(P.y)) - (Math.max(0, linha(P.y)) % ROWS);
  desenhaFundo(ox, oy);
  desenhaTiles(ox, oy);
  const g = guardaEngajado();
  guardas.forEach(gu => {
    if (Math.floor(gu.x / W) * COLS !== ox) return;
    boneco(gu, { roupa: "#b8452e", calca: "#2b2118", cinto: "#e0b040", pele: "#d9a77c", cabeca: "#8d939c" }, ox, oy, true);
  });
  boneco(P, { roupa: "#2bb3a3", calca: "#1d2a3a", cinto: "#e04a3a", pele: "#e7c39b", cabeca: "#1f8c80", capuz: true }, ox, oy, !!g || P.estado === "atacando");

  // HUD
  cx.fillStyle = "#000"; cx.fillRect(0, H, W, HUD);
  triangulos(P.hp, P.max, 10, 1, "#e23b4f");
  if (g) triangulos(g.hp, g.max, W - 22, -1, "#e0b040");
  const m = Math.floor(Math.max(0, tempo) / 3600), s = Math.floor(Math.max(0, tempo) / 60) % 60;
  cx.fillStyle = "#cfd6e0"; cx.font = "14px monospace"; cx.textAlign = "center";
  cx.fillText(String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "  ·  Nível " + (nivel + 1), W / 2, H + 22);
  if (msgT > 0) {
    cx.font = "bold 16px system-ui, sans-serif";
    const larg = Math.min(W - 20, cx.measureText(msg).width + 30);
    cx.fillStyle = "rgba(0,0,0,0.7)"; cx.fillRect(W / 2 - larg / 2, 14, larg, 30);
    cx.fillStyle = "#ffe9a8"; cx.fillText(msg, W / 2, 34);
  }
}

function telaTitulo(){
  const gr = cx.createLinearGradient(0, 0, 0, H + HUD);
  gr.addColorStop(0, "#0d1422"); gr.addColorStop(1, "#2a1d12");
  cx.fillStyle = gr; cx.fillRect(0, 0, W, H + HUD);
  quadro++;
  tocha(90, 120); tocha(W - 90, 120);
  cx.textAlign = "center";
  cx.fillStyle = "#e0b040"; cx.font = "bold 40px Georgia, serif";
  cx.fillText("Fuga do Calabouço", W / 2, 90);
  cx.fillStyle = "#cfd6e0"; cx.font = "15px system-ui, sans-serif";
  const linhas = [
    "Escape do calabouço em 15 minutos.",
    "← →  correr      Shift + ← →  andar com cuidado (passa nos espinhos)",
    "↑  pular / subir na borda / entrar na saída      ↓  descer da borda",
    "Espaço  atacar com a espada      ↑ perto do guarda  defender",
    "R  recomeçar o nível      Esc  sair do jogo"
  ];
  linhas.forEach((l, i) => cx.fillText(l, W / 2, 150 + i * 30));
  cx.fillStyle = "#ffe9a8"; cx.font = "bold 18px system-ui, sans-serif";
  if (Math.floor(quadro / 30) % 2) cx.fillText("Aperte Enter para começar", W / 2, 340);
}

// ---------- Laço ----------
function laco(t){
  if (!aberto) return;
  if (!ultimo) ultimo = t;
  acum += Math.min(100, t - ultimo); ultimo = t;
  while (acum >= 1000 / 60) { passo(); novos.clear(); acum -= 1000 / 60; }
  desenha();
  raf = requestAnimationFrame(laco);
}

// ---------- Tela do jogo ----------
const TECLAS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Shift", "Enter", "r", "R"];
function teclaDown(e){
  if (!aberto) return;
  if (e.key === "Escape") { fechar(); e.preventDefault(); return; }
  if (TECLAS.includes(e.key)) { e.preventDefault(); e.stopPropagation(); }
  if (!keys[e.key]) novos.add(e.key);
  keys[e.key] = true;
}
function teclaUp(e){ if (!aberto) return; keys[e.key] = false; if (e.key === "Shift") keys.Shift = false; }

function montaTela(){
  ov = document.createElement("div");
  ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Jogo Fuga do Calabouço");
  ov.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(5,7,12,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:12px";
  cv = document.createElement("canvas");
  cv.width = W; cv.height = H + HUD;
  cv.style.cssText = "width:min(96vw, calc((100vh - 140px) * " + (W / (H + HUD)).toFixed(3) + "), 1000px);height:auto;border-radius:10px;box-shadow:0 0 0 2px #2a3750,0 20px 60px rgba(0,0,0,.6);background:#000";
  cx = cv.getContext("2d");
  const fechar1 = document.createElement("button");
  fechar1.textContent = "Sair do jogo (Esc)";
  fechar1.style.cssText = "background:#1d2a3a;color:#cfd6e0;border:1px solid #3a4a66;border-radius:10px;padding:8px 14px;font:600 14px system-ui;cursor:pointer";
  fechar1.onclick = fechar;
  ov.append(cv);
  // Botões de toque (celular)
  if (window.matchMedia && matchMedia("(pointer: coarse)").matches) {
    const pad = document.createElement("div");
    pad.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center";
    [["◀", "ArrowLeft"], ["▶", "ArrowRight"], ["▲", "ArrowUp"], ["▼", "ArrowDown"], ["Espada", " "], ["Cuidado", "Shift"], ["Enter", "Enter"]].forEach(([rot, k]) => {
      const b = document.createElement("button");
      b.textContent = rot;
      b.style.cssText = "min-width:56px;min-height:48px;background:#1d2a3a;color:#cfd6e0;border:1px solid #3a4a66;border-radius:10px;font:600 16px system-ui;touch-action:none";
      b.onpointerdown = e => { e.preventDefault(); if (!keys[k]) novos.add(k); keys[k] = true; };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => { keys[k] = false; };
      pad.appendChild(b);
    });
    ov.appendChild(pad);
  }
  ov.appendChild(fechar1);
  document.body.appendChild(ov);
}

function fechar(){
  aberto = false; window.jogoAberto = false;
  cancelAnimationFrame(raf);
  Object.keys(keys).forEach(k => keys[k] = false);
  if (ov) ov.style.display = "none";
  document.body.style.overflow = "";
}

window.abrirJogo = function(){
  if (aberto) return;
  document.querySelectorAll("dialog[open]").forEach(d => d.close());
  if (document.activeElement) document.activeElement.blur();
  if (!ov) montaTela();
  ov.style.display = "flex";
  document.body.style.overflow = "hidden";
  aberto = true; window.jogoAberto = true;
  estado = "titulo"; msgT = 0; quadro = 0; acum = 0; ultimo = 0;
  raf = requestAnimationFrame(laco);
};
window.addEventListener("keydown", teclaDown, true);
window.addEventListener("keyup", teclaUp, true);
window.addEventListener("blur", () => Object.keys(keys).forEach(k => keys[k] = false));
})();
