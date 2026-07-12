const valoresCartas = {'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 10, 'Q': 10, 'K': 10, 'A': 11};
const naipes = ['♥', '♦', '♣', '♠'];

let baralho = [];
let maosJogador = [];      // agora é um ARRAY de mãos (pra suportar split)
let indiceMaoAtual = 0;
let maoDealer = [];
let jogoAtivo = true;

// placar acumulado entre rodadas
let placar = { vitorias: 0, derrotas: 0, empates: 0 };

const LIMITE_RESHUFFLE = 15; // se sobrar menos que isso, embaralha baralho novo

// ---------- BARALHO ----------

function criarBaralho() {
    const valores = Object.keys(valoresCartas);
    baralho = [];
    for (let i = 0; i < 4; i++) {
        for (const valor of valores) {
            for (const naipe of naipes) {
                baralho.push({ valor, naipe });
            }
        }
    }
    baralho.sort(() => Math.random() - 0.5);
}

// centraliza toda compra de carta: garante que nunca estoura o array vazio
function comprarCarta() {
    if (baralho.length < LIMITE_RESHUFFLE) {
        criarBaralho();
        console.log("Baralho reembaralhado (shoe reabastecido).");
    }
    return baralho.pop();
}

// ---------- PONTOS ----------

function calcularPontos(mao) {
    let pontos = mao.reduce((total, carta) => total + valoresCartas[carta.valor], 0);
    let aces = mao.filter(carta => carta.valor === 'A').length;

    while (pontos > 21 && aces > 0) {
        pontos -= 10;
        aces--;
    }
    return pontos;
}

function textoCarta(carta) {
    return `${carta.valor}${carta.naipe}`;
}

// ---------- SPLIT ----------

function podeSplitar(mao) {
    return mao.length === 2 && mao[0].valor === mao[1].valor;
}

function splitar() {
    if (!jogoAtivo) return;

    const maoAtual = maosJogador[indiceMaoAtual];
    if (!podeSplitar(maoAtual.cartas)) return;

    const novaMao1 = { cartas: [maoAtual.cartas[0], comprarCarta()], finalizada: false };
    const novaMao2 = { cartas: [maoAtual.cartas[1], comprarCarta()], finalizada: false };

    // substitui a mão atual pelas duas novas mãos, mantendo a ordem
    maosJogador.splice(indiceMaoAtual, 1, novaMao1, novaMao2);

    atualizarMesa(true);
    verificarEstadoMaoAtual();
}

// ---------- FLUXO DO JOGO ----------

function iniciarJogo() {
    jogoAtivo = true;
    placar = placar; // mantém o placar entre rodadas (não zera aqui)

    criarBaralhoSeNecessario();

    maosJogador = [{ cartas: [comprarCarta(), comprarCarta()], finalizada: false }];
    indiceMaoAtual = 0;
    maoDealer = [comprarCarta(), comprarCarta()];

    atualizarMesa(true);
    verificarEstadoMaoAtual();
}

function criarBaralhoSeNecessario() {
    // baralho persistente: só cria do zero na primeira vez, depois só reabastece via comprarCarta()
    if (baralho.length === 0) {
        criarBaralho();
    }
}

function verificarEstadoMaoAtual() {
    const mao = maosJogador[indiceMaoAtual];
    const pontos = calcularPontos(mao.cartas);

    // blackjack natural só conta se veio das 2 cartas originais (não após split)
    const ehNatural = mao.cartas.length === 2 && pontos === 21 && maosJogador.length === 1;

    if (ehNatural) {
        mao.finalizada = true;
        mao.resultado = 'blackjack';
        avancarOuFecharRodada();
    } else if (pontos >= 21) {
        mao.finalizada = true;
        avancarOuFecharRodada();
    }
}

function comprar() {
    if (!jogoAtivo) return;

    const mao = maosJogador[indiceMaoAtual];
    mao.cartas.push(comprarCarta());
    atualizarMesa(true);
    verificarEstadoMaoAtual();
}

function passar() {
    if (!jogoAtivo) return;

    maosJogador[indiceMaoAtual].finalizada = true;
    avancarOuFecharRodada();
}

function avancarOuFecharRodada() {
    const proximaExiste = indiceMaoAtual + 1 < maosJogador.length;

    if (proximaExiste) {
        indiceMaoAtual++;
        atualizarMesa(true);
    } else {
        jogarDealer();
    }
}

function jogarDealer() {
    jogoAtivo = false;

    // dealer só joga se pelo menos uma mão do jogador não estourou
    const algumaManteveJogo = maosJogador.some(mao => calcularPontos(mao.cartas) <= 21);

    if (algumaManteveJogo) {
        while (calcularPontos(maoDealer) < 17) {
            maoDealer.push(comprarCarta());
        }
    }

    atualizarMesa(false);
    determinarResultado();
}

// ---------- RESULTADO E PLACAR ----------

function determinarResultado() {
    const pontosDealer = calcularPontos(maoDealer);
    const mensagens = [];

    maosJogador.forEach((mao, i) => {
        const pontosJogador = calcularPontos(mao.cartas);
        const prefixo = maosJogador.length > 1 ? `Mão ${i + 1}: ` : '';

        if (mao.resultado === 'blackjack' && pontosDealer !== 21) {
            mensagens.push(`${prefixo}🂡 Blackjack! Você ganhou!`);
            placar.vitorias++;
        } else if (pontosJogador > 21) {
            mensagens.push(`${prefixo}❌ Estourou. Você perdeu.`);
            placar.derrotas++;
        } else if (pontosDealer > 21) {
            mensagens.push(`${prefixo}🎉 Dealer estourou. Você ganhou!`);
            placar.vitorias++;
        } else if (pontosJogador > pontosDealer) {
            mensagens.push(`${prefixo}🎉 Você ganhou!`);
            placar.vitorias++;
        } else if (pontosJogador < pontosDealer) {
            mensagens.push(`${prefixo}❌ Você perdeu!`);
            placar.derrotas++;
        } else {
            mensagens.push(`${prefixo}🤝 Empate!`);
            placar.empates++;
        }
    });

    exibirResultado(mensagens);
    exibirPlacar();
}

// ---------- RENDER (funções que mexem no DOM ficam isoladas aqui embaixo,
// pra facilitar quando a gente linkar com o HTML novo) ----------

function atualizarMesa(esconderDealer = true) {
    renderizarMaosJogador();
    renderizarDealer(esconderDealer);
    renderizarBotaoSplit();
}

function renderizarMaosJogador() {
    // TODO ao linkar com HTML: precisa de um container por mão (ou reaproveitar
    // #cartas-jogador pra mão única e criar containers extras quando houver split)
    const mao = maosJogador[indiceMaoAtual];
    const containerJogador = document.getElementById('cartas-jogador');
    if (!containerJogador) return;

    containerJogador.innerHTML = '';
    mao.cartas.forEach(carta => {
        containerJogador.innerHTML += `<div class="carta">${textoCarta(carta)}</div>`;
    });

    const pontosEl = document.getElementById('pontos-jogador');
    if (pontosEl) {
        const sufixoMao = maosJogador.length > 1 ? ` [Mão ${indiceMaoAtual + 1}/${maosJogador.length}]` : '';
        pontosEl.innerText = `(${calcularPontos(mao.cartas)})${sufixoMao}`;
    }
}

function renderizarDealer(esconderDealer) {
    const containerDealer = document.getElementById('cartas-dealer');
    if (!containerDealer) return;

    containerDealer.innerHTML = '';
    maoDealer.forEach((carta, index) => {
        if (index === 1 && esconderDealer) {
            containerDealer.innerHTML += `<div class="carta oculta">?</div>`;
        } else {
            containerDealer.innerHTML += `<div class="carta">${textoCarta(carta)}</div>`;
        }
    });

    const pontosEl = document.getElementById('pontos-dealer');
    if (pontosEl) {
        pontosEl.innerText = esconderDealer ? '' : `(${calcularPontos(maoDealer)})`;
    }
}

function renderizarBotaoSplit() {
    // TODO ao linkar com HTML: precisa de um <button id="btn-split">
    const btnSplit = document.getElementById('btn-split');
    if (!btnSplit) return;

    const mao = maosJogador[indiceMaoAtual];
    btnSplit.disabled = !jogoAtivo || !podeSplitar(mao.cartas);
}

function exibirResultado(mensagens) {
    // TODO ao linkar com HTML: se for split, dá pra juntar as linhas com <br>
    const resultadoDiv = document.getElementById('resultado');
    if (resultadoDiv) resultadoDiv.innerHTML = mensagens.join('<br>');

    const btnReiniciar = document.getElementById('btn-reiniciar');
    if (btnReiniciar) btnReiniciar.style.display = 'block';
}

function exibirPlacar() {
    // TODO ao linkar com HTML: precisa de um <div id="placar">
    const placarEl = document.getElementById('placar');
    if (placarEl) {
        placarEl.innerText = `Vitórias: ${placar.vitorias} | Derrotas: ${placar.derrotas} | Empates: ${placar.empates}`;
    }
}

window.onload = iniciarJogo;