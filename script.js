
const state = {
  shoe: [],
  numDecks: 6,
  bankroll: 1000,
  currentBet: 0,
  phase: 'betting', // betting | insurance | playerTurn | dealerTurn | roundEnd
  playerHands: [],
  activeHandIndex: 0,
  dealerCards: [],
  dealerHoleHidden: true,
  insuranceBet: 0,
  insuranceTaken: false,
};

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const SUITS = ['♠','♥','♦','♣'];
const CHIP_VALUES = [5,25,100,500,1000];

function createSingleDeck(){
  const deck = [];
  for(const suit of SUITS){
    for(const rank of RANKS){
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function createShoe(numDecks){
  let shoe = [];
  for(let i=0;i<numDecks;i++){
    shoe = shoe.concat(createSingleDeck());
  }
  return shoe;
}

function shuffleShoe(shoe){
  for(let i = shoe.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i+1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

function shoeNeedsReshuffle(){
  const totalCards = state.numDecks * 52;
  return state.shoe.length < totalCards * 0.25;
}

function reshuffleIfNeeded(){
  if(shoeNeedsReshuffle()){
    state.shoe = shuffleShoe(createShoe(state.numDecks));
  }
}

function drawCard(){
  if(state.shoe.length === 0){
    state.shoe = shuffleShoe(createShoe(state.numDecks));
  }
  return state.shoe.pop();
}

function cardNumericValue(card){
  if(card.rank === 'A') return 11;
  if(['K','Q','J'].includes(card.rank)) return 10;
  return parseInt(card.rank, 10);
}

function calculateHandValue(cards){
  let total = 0;
  let aces = 0;
  for(const c of cards){
    if(c.rank === 'A') aces++;
    total += cardNumericValue(c);
  }
  while(total > 21 && aces > 0){
    total -= 10;
    aces--;
  }
  const soft = aces > 0;
  return { total, soft };
}

function isBlackjackHand(cards){
  return cards.length === 2 && calculateHandValue(cards).total === 21;
}

function isBustHand(cards){
  return calculateHandValue(cards).total > 21;
}

function isPairForSplit(cards){
  return cards.length === 2 && cards[0].rank === cards[1].rank;
}

/* ======================================================================
   FÁBRICA DE MÃOS DO JOGADOR
   ====================================================================== */
function createHandObject(cards, bet, opts = {}){
  return {
    cards,
    bet,
    status: 'active',        // active | stand | bust | blackjack | surrendered
    hasActed: false,
    isSplitAces: !!opts.isSplitAces,
    canBeDoubled: opts.canBeDoubled !== undefined ? opts.canBeDoubled : true,
    result: null,             // win | lose | push | blackjack_win | surrender
  };
}

/* ======================================================================
   APOSTAS
   ====================================================================== */
function placeBetChip(value){
  if(state.phase !== 'betting') return;
  if(value > state.bankroll - state.currentBet) return;
  state.currentBet += value;
  renderBankroll();
  renderBetDisplay();
  updateDealButtonState();
}

function clearCurrentBet(){
  if(state.phase !== 'betting') return;
  state.currentBet = 0;
  renderBetDisplay();
  updateDealButtonState();
}

function deductBetFromBankroll(amount){
  state.bankroll -= amount;
}

function refundToBankroll(amount){
  state.bankroll += amount;
}

/* ======================================================================
   INÍCIO DE RODADA / DISTRIBUIÇÃO INICIAL
   ====================================================================== */
function startRound(){
  if(state.currentBet <= 0) return;
  reshuffleIfNeeded();

  deductBetFromBankroll(state.currentBet);

  state.playerHands = [ createHandObject([], state.currentBet) ];
  state.activeHandIndex = 0;
  state.dealerCards = [];
  state.dealerHoleHidden = true;
  state.insuranceBet = 0;
  state.insuranceTaken = false;
  state.phase = 'playerTurn';

  dealInitialCards();
  clearMessage();
  renderAll();

  runDealerBlackjackCheckFlow();
}

function dealInitialCards(){
  // Ordem clássica: jogador, dealer, jogador, dealer
  state.playerHands[0].cards.push(drawCard());
  state.dealerCards.push(drawCard());
  state.playerHands[0].cards.push(drawCard());
  state.dealerCards.push(drawCard());

  if(isBlackjackHand(state.playerHands[0].cards)){
    state.playerHands[0].status = 'blackjack';
  }
}

/* ======================================================================
   FLUXO DE SEGURO E CONFERÊNCIA DE BLACKJACK DO DEALER
   ====================================================================== */
function dealerUpCard(){
  return state.dealerCards[0];
}

function dealerShowsAce(){
  return dealerUpCard().rank === 'A';
}

function dealerShowsTenValue(){
  return cardNumericValue(dealerUpCard()) === 10;
}

function runDealerBlackjackCheckFlow(){
  if(dealerShowsAce()){
    offerInsurance();
    return;
  }
  if(dealerShowsTenValue()){
    resolveDealerPeek();
    return;
  }
  proceedToPlayerDecisions();
}

function offerInsurance(){
  state.phase = 'insurance';
  document.getElementById('insuranceOverlay').classList.add('show');
  updateActionBarAvailability();
}

function takeInsurance(){
  const cost = Math.floor(state.playerHands[0].bet / 2);
  const affordable = Math.min(cost, state.bankroll);
  state.insuranceBet = affordable;
  state.insuranceTaken = true;
  deductBetFromBankroll(affordable);
  closeInsuranceOverlay();
  resolveDealerPeek();
}

function declineInsurance(){
  state.insuranceTaken = false;
  state.insuranceBet = 0;
  closeInsuranceOverlay();
  resolveDealerPeek();
}

function closeInsuranceOverlay(){
  document.getElementById('insuranceOverlay').classList.remove('show');
}

function resolveDealerPeek(){
  if(isBlackjackHand(state.dealerCards)){
    state.dealerHoleHidden = false;
    settleInsuranceBets();
    settleRoundAgainstDealerBlackjack();
    return;
  }
  // Sem blackjack do dealer: seguro (se feito) é perdido, jogo continua
  proceedToPlayerDecisions();
}

function settleInsuranceBets(){
  if(state.insuranceBet > 0){
    refundToBankroll(state.insuranceBet * 3); // devolve + paga 2:1
  }
}

function settleRoundAgainstDealerBlackjack(){
  for(const hand of state.playerHands){
    if(hand.status === 'blackjack'){
      hand.result = 'push';
      refundToBankroll(hand.bet);
    } else {
      hand.result = 'lose';
    }
  }
  state.phase = 'roundEnd';
  renderAll();
  showMessage('O dealer tem Blackjack!');
  enableNextRoundControls();
}

function proceedToPlayerDecisions(){
  state.phase = 'playerTurn';
  if(state.playerHands[0].status === 'blackjack'){
    // Jogador já tem blackjack natural e dealer não tem: aguarda turno do dealer
    goToDealerTurnIfAllHandsDone();
    return;
  }
  renderAll();
}

/* ======================================================================
   AÇÕES DO JOGADOR
   ====================================================================== */
function getActiveHand(){
  return state.playerHands[state.activeHandIndex];
}

function playerHit(){
  if(state.phase !== 'playerTurn') return;
  const hand = getActiveHand();
  if(hand.status !== 'active') return;

  hand.cards.push(drawCard());
  hand.hasActed = true;

  if(isBustHand(hand.cards)){
    hand.status = 'bust';
    hand.result = 'lose';
    advanceAfterHandFinished();
  } else {
    renderAll();
  }
}

function playerStand(){
  if(state.phase !== 'playerTurn') return;
  const hand = getActiveHand();
  if(hand.status !== 'active') return;
  hand.status = 'stand';
  hand.hasActed = true;
  advanceAfterHandFinished();
}

function canDoubleActiveHand(){
  const hand = getActiveHand();
  if(!hand) return false;
  return hand.status === 'active' &&
         hand.cards.length === 2 &&
         hand.canBeDoubled &&
         !hand.isSplitAces &&
         state.bankroll >= hand.bet;
}

function playerDouble(){
  if(!canDoubleActiveHand()) return;
  const hand = getActiveHand();
  deductBetFromBankroll(hand.bet);
  hand.bet *= 2;
  hand.cards.push(drawCard());
  hand.hasActed = true;

  if(isBustHand(hand.cards)){
    hand.status = 'bust';
    hand.result = 'lose';
  } else {
    hand.status = 'stand';
  }
  advanceAfterHandFinished();
}

function canSplitActiveHand(){
  const hand = getActiveHand();
  if(!hand) return false;
  return hand.status === 'active' &&
         isPairForSplit(hand.cards) &&
         !hand.isSplitAces &&
         state.playerHands.length < 4 &&
         state.bankroll >= hand.bet;
}

function playerSplit(){
  if(!canSplitActiveHand()) return;
  const hand = getActiveHand();
  const rankBeingSplit = hand.cards[0].rank;
  const isAcesSplit = rankBeingSplit === 'A';

  deductBetFromBankroll(hand.bet);

  const handA = createHandObject([hand.cards[0]], hand.bet, { isSplitAces:isAcesSplit });
  const handB = createHandObject([hand.cards[1]], hand.bet, { isSplitAces:isAcesSplit });

  handA.cards.push(drawCard());
  handB.cards.push(drawCard());

  if(isAcesSplit){
    handA.status = 'stand';
    handB.status = 'stand';
    handA.hasActed = true;
    handB.hasActed = true;
  } else if(isBlackjackHand(handA.cards) === false && false){
    // (mãos divididas não contam como blackjack natural, apenas 21 comum — regra padrão)
  }

  state.playerHands.splice(state.activeHandIndex, 1, handA, handB);
  renderAll();

  if(isAcesSplit){
    advanceAfterHandFinished();
  }
}

function canSurrenderActiveHand(){
  const hand = getActiveHand();
  if(!hand) return false;
  return state.playerHands.length === 1 &&
         hand.cards.length === 2 &&
         !hand.hasActed &&
         hand.status === 'active';
}

function playerSurrender(){
  if(!canSurrenderActiveHand()) return;
  const hand = getActiveHand();
  hand.status = 'surrendered';
  hand.result = 'surrender';
  refundToBankroll(hand.bet * 0.5);
  advanceAfterHandFinished();
}

/* ======================================================================
   AVANÇO ENTRE MÃOS / TRANSIÇÃO PARA O DEALER
   ====================================================================== */
function advanceAfterHandFinished(){
  const nextIndex = state.activeHandIndex + 1;
  if(nextIndex < state.playerHands.length){
    state.activeHandIndex = nextIndex;
    renderAll();
  } else {
    goToDealerTurnIfAllHandsDone();
  }
}

function goToDealerTurnIfAllHandsDone(){
  state.phase = 'dealerTurn';
  renderAll();
  setTimeout(runDealerTurn, 500);
}

/* ======================================================================
   TURNO DO DEALER
   ====================================================================== */
function anyHandStillContestingDealer(){
  return state.playerHands.some(h => h.status === 'stand' || h.status === 'blackjack');
}

function dealerShouldHit(){
  const { total } = calculateHandValue(state.dealerCards);
  return total < 17; // dealer para em todos os 17 (soft ou hard)
}

function runDealerTurn(){
  state.dealerHoleHidden = false;
  renderAll();

  if(!anyHandStillContestingDealer()){
    finishRoundAndSettle();
    return;
  }
  dealerDrawLoop();
}

function dealerDrawLoop(){
  if(dealerShouldHit()){
    state.dealerCards.push(drawCard());
    renderAll();
    setTimeout(dealerDrawLoop, 550);
  } else {
    setTimeout(finishRoundAndSettle, 400);
  }
}

/* ======================================================================
   DETERMINAÇÃO DE RESULTADO E PAGAMENTOS
   ====================================================================== */
function determineOutcomeForHand(hand){
  if(hand.status === 'surrendered') return 'surrender';
  if(hand.status === 'bust') return 'lose';

  const dealerBJ = isBlackjackHand(state.dealerCards);
  const dealerTotal = calculateHandValue(state.dealerCards).total;
  const dealerBusted = dealerTotal > 21;

  if(hand.status === 'blackjack'){
    return dealerBJ ? 'push' : 'blackjack_win';
  }

  if(dealerBJ) return 'lose';
  if(dealerBusted) return 'win';

  const handTotal = calculateHandValue(hand.cards).total;
  if(handTotal > dealerTotal) return 'win';
  if(handTotal < dealerTotal) return 'lose';
  return 'push';
}

function payoutForOutcome(hand, outcome){
  switch(outcome){
    case 'blackjack_win': refundToBankroll(hand.bet * 2.5); break;
    case 'win':           refundToBankroll(hand.bet * 2); break;
    case 'push':          refundToBankroll(hand.bet); break;
    case 'surrender':     break; // já reembolsado metade no momento da desistência
    case 'lose':          break;
  }
}

function finishRoundAndSettle(){
  for(const hand of state.playerHands){
    if(hand.result) continue; // surrender já resolvido
    const outcome = determineOutcomeForHand(hand);
    hand.result = outcome;
    payoutForOutcome(hand, outcome);
  }
  state.phase = 'roundEnd';
  renderAll();
  showRoundSummaryMessage();
  enableNextRoundControls();
}

function showRoundSummaryMessage(){
  const results = state.playerHands.map(h => h.result);
  if(results.includes('blackjack_win')) { showMessage('Blackjack! Você ganhou 3 por 2!'); return; }
  if(results.every(r => r === 'lose'))  { showMessage('O dealer vence esta rodada.'); return; }
  if(results.every(r => r === 'push'))  { showMessage('Empate — aposta devolvida.'); return; }
  if(results.some(r => r === 'win'))    { showMessage('Você venceu!'); return; }
  if(results.some(r => r === 'surrender')){ showMessage('Mão desistida — metade da aposta devolvida.'); return; }
  showMessage('Rodada encerrada.');
}

function enableNextRoundControls(){
  state.currentBet = 0;
  checkForBankruptcy();
}

function checkForBankruptcy(){
  if(state.bankroll <= 0){
    setTimeout(() => {
      showMessage('Banca zerada! Uma nova banca de R$ 1000 foi concedida.');
      state.bankroll = 1000;
      renderBankroll();
    }, 800);
  }
}

/* ======================================================================
   NOVA RODADA (RESET DE MESA)
   ====================================================================== */
function resetTableForNextRound(){
  if(state.phase !== 'roundEnd' && state.phase !== 'betting') return;
  state.playerHands = [];
  state.dealerCards = [];
  state.activeHandIndex = 0;
  state.phase = 'betting';
  clearMessage();
  renderAll();
}

/* ======================================================================
   RENDERIZAÇÃO — CARTAS
   ====================================================================== */
function suitColorClass(suit){
  return (suit === '♥' || suit === '♦') ? 'red' : 'black';
}

function buildCardElement(card, faceDown){
  const el = document.createElement('div');
  if(faceDown){
    el.className = 'card back deal-anim';
    return el;
  }
  el.className = `card ${suitColorClass(card.suit)} deal-anim`;
  el.innerHTML = `
    <div class="corner">${card.rank}<br>${card.suit}</div>
    <div class="center-suit">${card.suit}</div>
    <div class="corner bottom">${card.rank}<br>${card.suit}</div>
  `;
  return el;
}

function renderHandRow(container, cards, hideLast){
  container.innerHTML = '';
  cards.forEach((card, i) => {
    const faceDown = hideLast && i === cards.length - 1;
    container.appendChild(buildCardElement(card, faceDown));
  });
}

/* ======================================================================
   RENDERIZAÇÃO — DEALER
   ====================================================================== */
function renderDealerHand(){
  const row = document.getElementById('dealerRow');
  renderHandRow(row, state.dealerCards, state.dealerHoleHidden);

  const valueBadge = document.getElementById('dealerValue');
  if(state.dealerCards.length === 0){
    valueBadge.textContent = '—';
    return;
  }
  if(state.dealerHoleHidden){
    valueBadge.textContent = cardNumericValue(state.dealerCards[0]) === 11 ? 'Ás' : String(cardNumericValue(state.dealerCards[0]));
  } else {
    const { total, soft } = calculateHandValue(state.dealerCards);
    valueBadge.textContent = soft ? `${total} (soft)` : String(total);
  }
}

/* ======================================================================
   RENDERIZAÇÃO — MÃOS DO JOGADOR
   ====================================================================== */
function resultLabelText(result){
  const map = {
    win: 'Ganhou', lose: 'Perdeu', push: 'Empate',
    blackjack_win: 'Blackjack!', surrender: 'Desistiu'
  };
  return map[result] || '';
}

function resultClass(result){
  const map = {
    win: 'res-win', lose: 'res-lose', push: 'res-push',
    blackjack_win: 'res-blackjack', surrender: 'res-lose'
  };
  return map[result] || '';
}

function renderPlayerHands(){
  const container = document.getElementById('handsContainer');
  container.innerHTML = '';

  state.playerHands.forEach((hand, idx) => {
    const slot = document.createElement('div');
    slot.className = 'hand-slot' + (idx === state.activeHandIndex && state.phase === 'playerTurn' ? ' active' : '');

    const row = document.createElement('div');
    row.className = 'hand-row';
    renderHandRow(row, hand.cards, false);
    slot.appendChild(row);

    const badge = document.createElement('div');
    badge.className = 'hand-value-badge';
    const { total, soft } = calculateHandValue(hand.cards);
    badge.textContent = `${soft ? total + ' (soft)' : total} · R$ ${hand.bet}`;
    slot.appendChild(badge);

    if(hand.result){
      const res = document.createElement('div');
      res.className = 'hand-result ' + resultClass(hand.result);
      res.textContent = resultLabelText(hand.result);
      slot.appendChild(res);
    } else if(hand.status === 'blackjack'){
      const res = document.createElement('div');
      res.className = 'hand-result res-blackjack';
      res.textContent = 'Blackjack!';
      slot.appendChild(res);
    }

    container.appendChild(slot);
  });
}

/* ======================================================================
   RENDERIZAÇÃO — HUD (BANCA / APOSTA / MENSAGEM)
   ====================================================================== */
function renderBankroll(){
  document.getElementById('bankrollDisplay').textContent = `R$ ${state.bankroll}`;
}

function renderBetDisplay(){
  document.getElementById('betDisplay').textContent = `R$ ${state.currentBet}`;
}

function showMessage(text){
  document.getElementById('messageBanner').textContent = text;
}

function clearMessage(){
  document.getElementById('messageBanner').textContent = '';
}

function renderShoeInfo(){
  document.getElementById('shoeInfo').textContent =
    `Sapata: ${state.shoe.length} cartas restantes de ${state.numDecks * 52}`;
}

/* ======================================================================
   RENDERIZAÇÃO — TRILHO DE FICHAS
   ====================================================================== */
function renderChipRail(){
  const rail = document.getElementById('chipRail');
  rail.innerHTML = '';
  CHIP_VALUES.forEach(value => {
    const chip = document.createElement('div');
    const disabled = state.phase !== 'betting' || value > (state.bankroll - state.currentBet);
    chip.className = 'chip' + (disabled ? ' disabled' : '');
    chip.dataset.v = value;
    chip.textContent = value >= 1000 ? '1K' : value;
    chip.addEventListener('click', () => placeBetChip(value));
    rail.appendChild(chip);
  });
}

/* ======================================================================
   RENDERIZAÇÃO — BARRA DE AÇÕES
   ====================================================================== */
function makeActionButton(label, onClick, opts={}){
  const btn = document.createElement('button');
  btn.className = 'action-btn' + (opts.primary ? ' primary' : '') + (opts.danger ? ' danger' : '');
  btn.textContent = label;
  btn.disabled = !!opts.disabled;
  btn.addEventListener('click', onClick);
  return btn;
}

function renderActionBar(){
  const bar = document.getElementById('actionBar');
  bar.innerHTML = '';

  if(state.phase !== 'playerTurn'){
    return;
  }

  bar.appendChild(makeActionButton('Pedir', playerHit, { disabled: getActiveHand().status !== 'active' }));
  bar.appendChild(makeActionButton('Parar', playerStand, { disabled: getActiveHand().status !== 'active' }));
  bar.appendChild(makeActionButton('Dobrar', playerDouble, { disabled: !canDoubleActiveHand() }));
  bar.appendChild(makeActionButton('Dividir', playerSplit, { disabled: !canSplitActiveHand() }));
  bar.appendChild(makeActionButton('Desistir', playerSurrender, { disabled: !canSurrenderActiveHand(), danger:true }));
}

function updateActionBarAvailability(){
  renderActionBar();
}

function updateDealButtonState(){
  const btn = document.getElementById('dealBtn');
  if(state.phase === 'roundEnd'){
    btn.disabled = false;
  } else {
    btn.disabled = !(state.phase === 'betting' && state.currentBet > 0);
  }
}

/* ======================================================================
   RENDER GERAL
   ====================================================================== */
function renderAll(){
  renderDealerHand();
  renderPlayerHands();
  renderBankroll();
  renderBetDisplay();
  renderShoeInfo();
  renderActionBar();
  renderChipRail();
  updateDealButtonState();
}

/* ======================================================================
   EVENTOS DE INTERFACE (BOTÕES FIXOS)
   ====================================================================== */
function wireStaticButtons(){
  document.getElementById('clearBetBtn').addEventListener('click', clearCurrentBet);
  document.getElementById('dealBtn').addEventListener('click', () => {
    if(state.phase === 'betting' && state.currentBet > 0){
      startRound();
    } else if(state.phase === 'roundEnd'){
      resetTableForNextRound();
    }
  });
  document.getElementById('insuranceYesBtn').addEventListener('click', takeInsurance);
  document.getElementById('insuranceNoBtn').addEventListener('click', declineInsurance);
}

function updateDealButtonLabelByPhase(){
  const btn = document.getElementById('dealBtn');
  btn.textContent = state.phase === 'roundEnd' ? 'Nova rodada' : 'Distribuir';
}

const originalRenderAll = renderAll;
renderAll = function(){
  originalRenderAll();
  updateDealButtonLabelByPhase();
};

/* ======================================================================
   INICIALIZAÇÃO
   ====================================================================== */
function initGame(){
  state.shoe = shuffleShoe(createShoe(state.numDecks));
  wireStaticButtons();
  renderAll();
}

initGame();