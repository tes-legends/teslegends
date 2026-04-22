//deck.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, BehaviorSubject, forkJoin } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Target } from '@angular/compiler';
import { UtilityService } from './utility.service';

export type DeckSource = 'starter' | 'random' | 'npc' | 'custom' | 'arena';

export interface DeckOption {
  source: DeckSource;
  name: string;
  deckCode?: string;          // for starter / npc / custom
  attributes: string[];       // for icons
  class?: string;             // for random decks
  description?: string;
  isRandom: boolean;
  avatar?: string;
  elo?: number;
  tier?: number;
  locked?: boolean;           // for story mode restrictions
  unlockAfterChapter?: number;
}

export interface DeckEntry {
  card: Card;
  count: number;
}

export interface SavedDeck {
  name: string;
  deckCode: string; // generated when saving
  attributes: string[];
}

export type PendingActionType = 
  | 'attackAnim'
  | 'creatureAnim'
  | 'actionLaneAnim'
  | 'actionTargetAnim'
  | 'supportAnim'
  | 'itemAnim'
  | 'choice'
  | 'reveal'
  | 'revealAndChoose'
  | 'targetSelection'
  | 'laneSelection'
  | 'gameOver'
  | 'burn'
  | 'prophecy'
  | 'history'
  | 'audio'
  | 'revealAndGuess'
  | 'fabricate'
  | 'stitch'
  | 'none';

export interface TreasureHuntData {
  requirements: TreasureRequirement[];
  completed: boolean;
}

export interface TreasureRequirement {
  type: string;
  subtype?: string;           // e.g. "Redguard", "Dragon", etc.
  required: number;           // How many are needed
  found: number;              // How many have been found so far (starts at 0)
}

export interface GameState {
  player: PlayerState;
  opponent: PlayerState;
  laneTypes: string[];
  history: HistoryEntry[];
  gameRunning: boolean;
  pendingActions: PendingAction[];
  firstPlayer: 'player' | 'opponent';
  currentRound: number;
  currentTurn: number;
  cpuPlaying: boolean;
  classicTargeting: boolean;
  tempCostAdjustment: number;
  targetLaneRequired: boolean;
  stagedCard: Card | null
  stagedAttack: Card | null;
  stagedSummon: Card | null;
  stagedSummonEffect: CardEffect | null;
  stagedProphecy: Card | null;
  stagedSupportActivation: Card | null;
  stagedAction: 'play-creature' | 'play-item' | 'play-action' | 'choice-followup' | 'none';
  creatureSlain: Card | null;
  creatureSlayer: Card | null;
  creatureShackled: Card | null;
  thief: Card | null;
  rallyist: Card | null;
  creatureMoved: Card | null;
  creatureRevealed: Card | null;
  lastCardPlayed: Card | null;
  lastCardDrawn: Card | null;
  lastCardSummoned: Card | null;
  lastCardSummoned2: Card | null;
  lastCardDealingDamage: Card | null;
  lastCardReceivingDamage: Card | null;
  lastCreatureTargeted: Card | null;
  lastCardEquipped: Card | null;
  lastDamageTaken: number; //damage taken to a card
  lastHealingTaken: number; //healing taken to a card
  cardsDiscarded?: number;
  healthJustGained: number;
  isProcessingDeath: boolean;
  isProcessingPlayerDead: boolean;
  waitingOnScry: boolean;
  betrayAvailable: boolean;
  waitingOnAnimation: boolean;
  useAnimation: boolean;
  isProcessingEndOfTurn: boolean;
  simulating: boolean;
}

export interface PendingAction {
  type: PendingActionType;
  sourceCard?: Card;                    // who triggered it
  target?: Card | PlayerState;
  effect?: CardEffect;                  // the original effect that needs input
  options?: ChoiceOption[];            // for 'choice' / 'revealAndChoose'
  revealCards?: Card[];                // for reveal modes
  opponentTarget?: boolean;
  validTargets?: (Card | PlayerState)[]; // for target selection
  validLanes?: number[];               // for lane choice
  prompt?: string;                     // e.g. "Choose one to draw" or "Select target"
  timeoutMs?: number;                  // optional auto-resolve timer
  autoResolveForCpu?: boolean;         // flag for AI to handle automatically
}

// History entry types
export interface HistoryEntry {
  turnNumber: number;
  player: 'You' | 'Opponent';
  actionType: 
    | 'play-card' 
    | 'attack' 
    | 'effect'
    | 'attack-effect' 
    | 'summon-effect' 
    | 'action-effect' 
    | 'move-effect'
    | 'draw-effect'
    | 'support-activation'
    | 'rune-break'
    | 'prophecy-play'
    | 'defeat'
    | 'death'
    | 'choice';
  description: string;
  details?: string[];           // optional bullet points / sub-actions
}

export interface Card {
  // Core identification & static data (from JSON)
  instanceId?: string;  // Unique runtime ID for each card copy (required for selection/equality)
  id: string;           // Unique card template ID (e.g. "afflicted-alit")
  name: string;
  type: 'Creature' | 'Item' | 'Support' | 'Action';
  subtypes: string[];
  attributes: string[];
  cost: number;
  attack?: number;      // Base attack (Creature only)
  health?: number;      // Base health (Creature only)
  rarity: string;
  text: string;         // Human-readable text (for tooltips/display)
  keywords: string[];   // Base keywords
  set: string;
  deckCodeId?: string | null;

  tier?: string;

  // Targeting / effect metadata (from JSON)
  scaleDamage?: number;                   // Fixed damage amount (e.g. for actions)

  // Runtime / game state (added when cloning/playing)
  isOpponent?: boolean;              // Whether this card instance belongs to opponent
  sick?: boolean;
  attacks?: number;                  // Creatures not shackled have 1 attack at start of turn; also applies to available support activations
  covered?: boolean;                 // In shadow lane, can't be attacked unless Guard
  shackled?: boolean;                // Can't attack or use abilities, but still counts as on board for effects
  frozen?: boolean;               // Permanently shackled
  silenced?: boolean;                // Lost all text/keywords/effects, but still counts as on board for effects
  banished?: boolean;
  laneIndex?: number;                // 0 = shadow lane, 1 = field lane
  //wounded?: boolean;                  // health !== maxhealth

  //Flags 
  unique?: boolean;     // can only add 1 of these per deck
  immunity?: string[];    // some cards are immune to targeting
  uses?: number;        // For supports with limited activations
  activations?: number;
  targetReq?: boolean;  // most summon effects can be played without valid targets, but sometimes we need to force it and not allow skipping
  prophecy?: boolean;   // Prophecy keyword (plays from rune for free)

  // Creature runtime stats (modifiable by items/effects)
  currentAttack?: number;     // starts as attack, modified by items/effects
  currentHealth?: number;     // starts as health
  maxHealth?: number;
  currentKeywords?: string[]; // merged from base + items
  //these modifications are removed at end of current turn
  tempAttack?: number;      
  tempHealth?: number;
  tempKeywords?: string[];

  attacksPerTurn?: number;

  currentCost?: number;
  totalDamageDealt?: number;
  counter?: number;
  endOfTurn?: string;
  exalted?: boolean;
  exaltCost?: number;

  // Attachments (only relevant for Creatures)
  attachedItems?: Card[];     // list of equipped Item cards

  treasureHunt?: TreasureHuntData; // for treasure hunt cards

  // NEW: Structured effects (replaces most text parsing)
  effects?: CardEffect[];

  static?: StaticEffect;
  staticBuffApplied?: number;

  playCondition?: {
    type: 'friendlyCreatureInEachLane' | 'damageEachLane' | 
    'creatureFiveAttack';
  }
  attackCondition?: {
    type: 'thisLaneFull' | 'playedAction' | 'twoCreatureFiveAttack';
  }

}

export interface StaticEffect {
  condition?: {
    type: 'hasMoreCreaturesThisLane' | 'maxMagicka' | 'handEmpty' | 'hasItem' |
    'isYourTurn' | 'noEnemyCreaturesThisLane' | 'creatureFriendlyOtherBreakthrough' |
    'hasHealth';
    min?: number;
    max?: number;
  };
  cannotGainKeyword?: string;
  immunity?: "actionDamage";
  amountPer?: "creatureFriendlyOtherBreakthrough";
  modAttack?: number;
  modHealth?: number;
  addKeywords?: string[];
}

export interface ChoiceOption {
  text: string;
  effect: CardEffect;  // nested effect to execute when chosen
}

export interface CardEffect {
  trigger: 'Summon' | 'Play' | 'StartOfGame' | 'StartOfTurn' | 'EndOfTurn' | 'When' | 'EndOfEachTurn' |
  'Slay' | 'EquipItem' | 'Attack' | 'LastGasp' | 'After' | 
  'StartOfEachTurn' | 'Aura' | 'Activation' | 'MaxMagickaIncreased' |
  'SummonCreature' | 'DamageTaken' | 'Pilfer' | 'DestroyRune' | 'WardBroken' |
  'FriendlyAttack' | 'MoveCreature' | 'CreatureDeathThisLane' | 
  'SummonCreatureEnemy' | 'ActivateSupport' | 'DamageDealt' | 'HealPlayer' | 'FriendlySlay' | 
  'CreatureFriendlyDeath' | 'FriendlyPilfer' | 'EnemyShackle' | 'SummonFirst' |
  'AddToHand' | 'PlayCard' | 'DrawCard' | 'Move' | 'HealCreature' | 'FriendlyDrain' | 
  'GainCover' | 'FriendlyLethalSlay' | 'CreatureEnemyDeath' | 'EquipFriendly' |
  'OppProphecy' | 'PlayerDead' | 'FailRally' | 'Rally' | 'FriendlyRally' | 'Exalt' |
  'Plot' | 'FriendlyDamageTaken' | 'Sacrifice' | 'SummonSecond' | 'DamagedByCreature';

  type: 'damage' | 'heal' | 'buffSelf' | 'buffTarget' | 'drawCards' | 
  'addToHand' | 'silence' | 'unsummon' | 'destroy' | 
  'choice' | 'choiceRandom' | 'shackle' | 'steal' | 'transform' |
  'extraAttack' | 'doubleAttack' | 'doubleHealth' | 'doubleStats' |
  'summon' | 'magicka' | 'sacrifice' |
  'destroyAllExcept' | 'move' | 'maxMagicka' | 'modCost' | 'tempModCost' |
  'summonDiscard' | 'summonSlain' | 'shuffleIntoDeck' | 'grantImmunity' |
  'grantRandomKeyword' | 'drawCardsProphecy' | 'banish' | 'shareKeywords' |
  'summonRandomCost' | 'equipDiscard' | 'summonRandomMax' | 'revealTopDeck' |
  'shuffleProphecy' | 'summonCopy' | 'drawRandomOpp' | 'equipRandom' |
  'fieldToShadow' | 'drawFromDiscard' | 'summonOpponent' | 'allLastGasp' |
  'drawDiscard' | 'stealKeywords' | 'summonDeck' | 'summonOppDiscard' |
  'drawFiltered' | 'healDamageTaken' | 'stealItems' | 'moveToBottom' |
  'revealAndChoose' | 'revealAndChooseOpp' | 'revealAndChooseCost' | 'revealAndTransform' | 
  'triggerSummon' | 'modifyDebuff' | 'freeze' | 'drawAndReduceCost' |
  'giveKeywordsToHandRandom' | 'winGame' | 'tradeHand' | 'upgrade' | 'discardHand' |
  'extraUse' | 'transpose' | 'change' | 'modCostDiscard' | 'equip' | 'addSubtype' |
  'battle' | 'grantEffect' | 'buffDeck' | 'stealAndReplace' | 'blink' | 'spendAllForStats' |
  'setPowerToHealth' | 'setStats' | 'drawFilteredPower' | 'shuffleCreaturesDiscard' | 
  'transpose' | 'scry' | 'discardTopDeck' | 'revealAndGuess' | 'magickaLimit' | 
  'summonBuffStats' | 'powerToLane' | 'discard' | 'summonDeckLastCost' | 'equipCard' |
  'markForDeath' | 'triggerSlay' | 'discardDeck' | 'pilferSlay' | 'addCounter' | 'drawFull' |
  'summonHighTemp' | 'moveAll' | 'addTempCost' | 'summonDeckCost' | 'buffSubtype' |
  'equipCopy' | 'revealAndChooseDeck' | 'playSupport' | 'rollForReturn' |
  'copyKeywordsDeck' | 'summonTopDeck' | 'banishDiscard' | 'damageName' |
  'setNeutral' | 'beckon' | 'restoreRune' | 
  'summonRandomCounter' | 'playerBattle' | 'fabricate' | 'stitch' |
  'drawTreasure' | 'summonUnique' | 'oneOfEach' | 'playRandomDeck' | 'drawFromDeck' |
  'thaw' | 'grantWard' | 'revealAndChooseName' | 'drawMultiAttr' | 'allExalt' |
  'removeEffects' | 'takeCard' | 'battleAttack' | 'summonMaxAttack' |
  'summonRandomMagicka' | 'summonDeckCostMax' | 'secretDeath' | 'summonDiscardAttack' |
  'drawMagicka' | 'revealAndChooseGive' | 'revealAndGuessBuff' | 'removeProphecy' |
  'invertStats';
  amount?: number; //number cards, amount of damage
  target?: TargetType;
  // Conditions
  condition?: {
    type: 'hasOtherOnBoard' | 'hasKeyword' | 'hasDestroyedRune' | 
    'hasMoreHealth' | 'topDeckAttribute' | 'handEmpty' |
    'enemyCreatureInSameLane' | 'hasSubtype' | 'maxMagicka' | 'drawnCardCost' |
    'wounded' | 'noDamageTaken' | 'hasItem' | 'tgtHasKeyword' | 'hasNotKeyword' |
    'hasMoreCreaturesThisLane' | 'creatureDied' | 'hasAttack' | 'creatureAlive' |
    'hasHigherAttack' | 'attributeCount' | 'woundedThisLane' | 'playedActions' |
    'hasFewerCards' | 'lastSummonCost' | 'hasInHand' | 'isFirstTurn' |
    'summonAttribute' | 'targetNotOnBoard' | 'hasLessHealth' | 'topDeckType' |
    'totalDmgByCard' | 'summonType' | 'creatureFriendlyDied' | 'numCreatures' |
    'lanesFull' | 'lastSummonAttack' | 'lastSummonHealth' | 'lastPlayedCost' | 
    'discardHasSubtype' | 'numActivations' | 'isAlive' | 'counter' | 'inLane' |
    'hasInPlay' | 'isPlayerTurn' | 'playedCards' | 'deckUnique' | 
    'playedActionItemSupport' | 'hasCreatureAttack' | 'hasExaltedCreature' |
    'noEnemyCreaturesThisLane' | 'notExalted' | 'haveAllAttributes';
    subtypes?: string[];
    keyword?: string;
    attribute?: string;
    min?: number;
    max?: number;
  };
  targetCondition?: {
    type: 'hasSubtype' | 'hasKeyword' | 'hasAttribute' | 'hasType' | 'hasName' |
    'sameLaneAsSource' | 'isWounded' | 'hasAttack' | 'isUnique' | 'notMostPowerful' |
    'hasLessAttack' | 'isExalted' | 'hasNoKeywords';
    subtypes?: string[];
    keyword?: string;
    attribute?: string;
    names?: string[];
    min?: number;
    max?: number;
  }
  choices?: ChoiceOption[];  
  addKeywords?: string[];
  removeKeywords?: string[];
  source?: 'deck' | 'enemyDeck';
  subtypes?: string[];   // e.g. ["Beast", "Fish", "Reptile", ...]
  names?: string[];
  cardId?: string;  // for addToHand effects
  amountPer?: string;
  modAttack?: number;
  modHealth?: number;
  modCost?: number;
  cost?: number;
  increment?: number;
  tempAttack?: number;     
  tempHealth?: number;
  tempKeywords?: string[]
  immunity?: string;
  temporary?: boolean; // for buffs that should be removed at end of turn
  grantedEffect?: CardEffect; // for effects that grant a new ability
}
export interface PlayerState {
  health: number;
  currentMagicka: number;
  maxMagicka: number;
  hand: Card[];
  board: Card[][]; // 2 lanes: [0] = left/field, [1] = right/shadow
  support: Card[];
  deck: Card[];
  discard: Card[];  
  limbo: Card[];        
  runes: boolean[]; // 5 runes, true = intact
  auras: AuraEffect[];
  cardUpgrades: Record<string, string>;
  playCounts: Record<string, number>;
  summonCounts: Record<string, number>;
  turn: boolean;
  diedLane: number[];
  damageLane: number[];
  damageTaken: number; //damage to player
  numSummon: number;
  actionsPlayed: number;
  cardsPlayed: number;
  cardsDrawn: number;
  tempCost: number;
  hasWard: boolean;
  deckUnique: boolean;
}

export interface AuraEffect {
  sourcePlayer: 'player' | 'opponent';
  sourceInstanceId: string;           // the card providing the aura
  sourceCard: Card;
  sourceEffect: CardEffect;
  type: CardEffect['type'];  // 'buff' | 'debuff' etc.
  targetType: string,
  modAttack?: number;
  modHealth?: number;
  keywordsToAdd?: string[];
  amount?: number;
  immunity?: string;
  targetFilter: (c: Card) => boolean; // function that decides if a card should receive this aura
  appliedTo: Set<string>;             // instanceIds of cards currently buffed by this aura
  isPlayerAura: boolean;        // NEW: flag for player-level auras
  isHandAura: boolean;
  affectsOpponentHand: boolean;
}

export type TargetType = 
  | 'any'                   
  | 'chooseThree'                // special: present 3 choices
  | 'creature'                      
  | 'creatureWounded'
  | 'creatureAll'                 //auto
  | 'creatureEnemy' 
  | 'creatureEnemyWounded' 
  | 'creatureEnemyAll'              //auto
  | 'creatureEnemyRandom'           //auto
  | 'creatureEnemyRandomLeftLane'
  | 'creatureEnemyRandomRightLane'
  | 'creatureEnemyThisLane'
  | 'creatureEnemyOtherLane'
  | 'creatureEnemyThisLaneAll'      //auto
  | 'creatureFriendly'
  | 'creatureFriendlyAll'           //auto
  | 'creatureFriendlyOther'
  | 'creatureFriendlyOtherAll'      //auto
  | 'creatureFriendlyOtherThisLane'
  | 'creatureFriendlyOtherThisLaneAll'  //auto
  | 'creatureFriendlyThisLaneAll'   //auto
  | 'creatureFriendlyThisLane'   //auto
  | 'creatureFriendlyOtherRandom'
  | 'creatureFriendlyOtherLane'
  | 'creatureFriendlyRandom'
  | 'creatureFriendlyRandomLeftLane'
  | 'creatureFriendlyRandomRightLane'
  | 'creatureOther'
  | 'creatureOtherAll'           //auto
  | 'creatureOtherThisLaneAll'      //auto
  | 'creatureThisLaneAll'           //auto
  | 'creatureThisLane'           
  | 'creatureSupportEnemy'
  | 'enemyAll'                      //auto
  | 'enemyRandom'                   //auto
  | 'opponent'                      //auto
  | 'player'                        //auto
  | 'players'                       //auto
  | 'randomLane'
  | 'playerHand'                    //auto all cards in hand
  | 'opponentHand'
  | 'allHands'
  | 'lane'                       // goes to subtarget for details
  | 'special'                    // card-specific logic
  | 'supportEnemy'
  | 'currentPlayer'                //auto
  | 'self'
  | 'summon'                      //used for summonCreature trigger to target that creature
  | 'moved'
  | 'slain'                        //used to target creature slain
  | 'slayer'
  | 'thief'
  | 'cardRallied'
  | 'creatureShackled'
  | 'lastCardUsed'
  | 'creatureDamaged'
  | 'drawnCard'                   //targets last card drawn
  | 'playedCard'
  | 'deck'
  | 'topDeck'
  | 'oppTopDeck'
  | 'wielder'
  | 'namedCard'
  | 'instanceId'
  | 'creatureTopDeck'
  | 'creaturesTopDeck'
  | 'supportFriendlyAll'
  | 'creatureDiscardAll'
  | 'cardPlayerHandRandom'
  | 'cardPlayerHand'
  | 'maxCostOppHand'
  | 'factotum'
  | 'leftLane'
  | 'rightLane'  
  | 'weakerLane'
  | 'thisLane'
  | 'randomLane'
  | 'otherLane';                    //auto

export interface SavedGameState {
  version: number;                    // for future migration
  storyMode: boolean;
  storyChapterIndex: number;
  arenaMode: boolean;
  rankedMode: boolean;
  animationsEnabled: boolean;
  turnNumber: number;
  player: SavedPlayerState;
  opponent: SavedPlayerState;
  cpuPlaying: boolean;
  tempCostAdjustment: number;
  laneTypes: string[];
  firstPlayer: 'player' | 'opponent';
  history: HistoryEntry[];
}

export interface SavedPlayerState {
  health: number;
  currentMagicka: number;
  maxMagicka: number;
  hand: SavedCard[];                // ← full serialized card objects
  board: SavedCard[][];             // lanes of serialized cards
  support: SavedCard[];
  deck: SavedCard[];
  discard: SavedCard[];
  runes: boolean[];
  auras: SavedAura[];               // serialized auras
  upgrades: Record<string,string>;
  counts: Record<string,number>;
  summonCounts: Record<string,number>;
  turn: boolean;
  diedLane: number[];
  damageLane: number[];
  damageTaken: number;
  numSummon: number;
  actionsPlayed: number;
  cardsPlayed: number;
  cardsDrawn: number;
  tempCost: number;
  hasWard: boolean;
  deckUnique: boolean;
}

export interface SavedCard {
  id: string;
  instanceId: string;
  isOpponent: boolean;
  laneIndex?: number;
  currentAttack: number;
  currentHealth: number;
  maxHealth: number;
  attacks: number;
  attacksPerTurn: number;
  covered: boolean;
  shackled: boolean;
  silenced: boolean;
  currentKeywords: string[];
  tempAttack: number;
  tempHealth: number;
  tempKeywords: string[];
  currentCost?: number;
  uses?: number;
  attachedItems: SavedCard[];         // recursive for items on creatures
  staticBuffApplied?: number;
  activations: number;
  counter: number;
  sick: boolean;
  frozen: boolean;
  scaleDamage: number;
  immunity: string[];
  // Add any other runtime fields you have (e.g. tempKeywords, immunity, etc.)
}  

export interface SavedAura {
  sourcePlayer: 'player' | 'opponent';     // ← NEW: critical
  sourceInstanceId: string;
  sourceCard: SavedCard;
  sourceEffect: CardEffect;
  type: string;
  amount?: number;
  modAttack?: number;
  modHealth?: number;
  keywordsToAdd?: string[];
  immunity?: string;
  isPlayerAura: boolean;
  isHandAura: boolean;
  affectsOpponentHand: boolean;
  appliedTo: string[];          // array of instanceIds (Set → array for JSON)
  targetType?: string;                      // ← save original effect.target (e.g. 'creatureFriendlyAll')
  targetCondition?: any;                    // ← save condition object to rebuild filter

}

@Injectable({
  providedIn: 'root'
})
export class DeckService {
  private cards: Card[] = [];
  private cardByDeckCodeId = new Map<string, Card>();
  private cardById = new Map<string, Card>();

  private cardsSubject = new BehaviorSubject<Card[]>([]);
  cards$ = this.cardsSubject.asObservable();

  keywordList = ['Breakthrough', 'Charge', 'Drain', 'Guard', 'Lethal', 'Rally', 'Regenerate', 'Ward' ];

  constructor(private http: HttpClient, private utilityService: UtilityService) {
    this.loadCards();
  }

  private loadCards() {
    forkJoin({
      core: this.http.get<Card[]>('/assets/tesl/core_set.json'),
      brotherhood: this.http.get<Card[]>('/assets/tesl/brotherhood_set.json'),
      skyrim: this.http.get<Card[]>('/assets/tesl/skyrim_set.json'),
      madhouse: this.http.get<Card[]>('/assets/tesl/madhouse_set.json'),
      forgotten: this.http.get<Card[]>('/assets/tesl/forgotten_set.json'),
      reward: this.http.get<Card[]>('/assets/tesl/reward_set.json'),
      story: this.http.get<Card[]>('/assets/tesl/story_set.json'),
      clockwork: this.http.get<Card[]>('/assets/tesl/clockwork_set.json'),
      morrowind: this.http.get<Card[]>('/assets/tesl/morrowind_set.json'),
      custom: this.http.get<Card[]>('/assets/tesl/custom_set.json')
    }).subscribe({
        next: ({ core, brotherhood, skyrim, madhouse, forgotten, reward, story, clockwork, morrowind, custom }) => {
        const cards = [...core, ...brotherhood, ...skyrim, ...madhouse, ...forgotten, ...reward, ...story, ...clockwork, ...morrowind, ...custom];
        let collectibleCards = 0;
        this.cards = cards;
        cards.forEach(card => {
            if (card.deckCodeId) {
              this.cardByDeckCodeId.set(card.deckCodeId, card);
              if (card.set !== 'Story Set') collectibleCards++;
            }
            if (card.id) {
              this.cardById.set(card.id, card);
            }
        });
        /*const deckCodeList = cards
          .filter(card => card.deckCodeId != null)
          .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
          .map(card => ({
            id: card.id,
            deckCodeId: card.deckCodeId
          }));

        console.table(deckCodeList);*/
        console.log(`Loaded ${cards.length} cards from sets. ${collectibleCards} are collectible.`);
        // Optional: emit an event or use BehaviorSubject to notify components
        // Notify everyone that cards are ready!
        this.cardsSubject.next(cards);
        },
        error: (err) => {
        console.error('Failed to load cards:', err);
        }
    });
  }

  getAllCards(): Card[] {
    return [...this.cards];
  }

  getMostCards(): Card[] {
    const allCards = [...this.cards];
    const matching = allCards.filter(card => { 
      if (card.deckCodeId === null || 
        card.deckCodeId === undefined || 
        card.set === 'Story Set') {
        return false; // skip cards without deckCodeId (e.g. generated tokens)
      }
      if (!this.customSetsAllowed && card.set === 'Custom Set') return false;
      if (!this.morrowindSetsAllowed && ['Houses of Morrowind','Clockwork City',
          'Forgotten Hero Collection'].includes(card.set)) return false;
      // If we got here → card matches
      return true;
    });
    return matching;
  }

  getCardsByAttribute(attr: string): Card[] {
    return [...this.cards
      .filter(c => 
        c.attributes.length === 1 && c.attributes[0] === attr &&
        c.deckCodeId?.length === 2 && c.set !== 'Story Set'
      )];
  }

  getCardsByAttributes(attr1: string, attr2: string): Card[] {
    return [...this.cards
      .filter(c => c.attributes.length === 2 && 
        c.attributes.includes(attr1) && c.attributes.includes(attr2) &&
        c.deckCodeId?.length === 2 && c.set !== 'Story Set')];
  }

  /**
   * Decode an ESL deck code and return the list of cards + counts
   */
  decodeDeckCode(deckCode: string): DeckEntry[] | null {
    if (!deckCode.startsWith('SP')) {
      console.warn('Invalid deck code: must start with SP');
      return null;
    }
    console.log(`reading deck code: ${deckCode}`);
    try {
      // Remove prefix "SP"
      const code = deckCode.substring(2);

      let offset = 0;

        // 1. Read count of 1-of cards
        const count1Str = code.substring(offset, offset + 2);
        offset += 2;
        const count1 = this.base26ToNumber(count1Str);

        // 2. Read all 1-of card IDs
        const entries: DeckEntry[] = [];
        for (let i = 0; i < count1; i++) {
        if (offset + 2 > code.length) throw new Error('Deck code truncated');
        const id = code.substring(offset, offset + 2);
        const card = this.cardByDeckCodeId.get(id);
        if (card) {
            entries.push({ card, count: 1 });
        } else {
            console.warn(`Unknown card ID: ${id}`);
        }
        offset += 2;
        }

        // 3. Read count of 2-of cards
        if (offset + 2 > code.length) throw new Error('Deck code truncated');
        const count2Str = code.substring(offset, offset + 2);
        offset += 2;
        const count2 = this.base26ToNumber(count2Str);

        // 4. Read all 2-of card IDs
        for (let i = 0; i < count2; i++) {
        if (offset + 2 > code.length) throw new Error('Deck code truncated');
        const id = code.substring(offset, offset + 2);
        const card = this.cardByDeckCodeId.get(id);
        if (card) {
            entries.push({ card, count: 2 });
        } else {
            console.warn(`Unknown card ID: ${id}`);
        }
        offset += 2;
        }

        // 5. Read count of 3-of cards
        if (offset + 2 > code.length) throw new Error('Deck code truncated');
        const count3Str = code.substring(offset, offset + 2);
        offset += 2;
        const count3 = this.base26ToNumber(count3Str);

        // 6. Read all 3-of card IDs
        for (let i = 0; i < count3; i++) {
        if (offset + 2 > code.length) throw new Error('Deck code truncated');
        const id = code.substring(offset, offset + 2);
        const card = this.cardByDeckCodeId.get(id);
        if (card) {
            entries.push({ card, count: 3 });
        } else {
            console.warn(`Unknown card ID: ${id}`);
        }
        offset += 2;
        }

        // Optional: validate total length
        if (offset !== code.length) {
        console.warn(`Deck code has extra characters after parsing`);
        }

        const totalCards = entries.reduce((sum, e) => sum + e.count, 0);
        if (totalCards < 30) {
          console.log(`Decoded deck with ${entries.length} unique cards (${totalCards} total cards)`);
        }

        return entries.length > 0 ? entries : null;
    } catch (e) {
      console.error('Failed to decode deck code:', e);
      return null;
    }
  }

  encodeDeckCode(entries: DeckEntry[]): string {
    if (!entries || entries.length === 0) {
      console.warn('Cannot encode empty deck');
      return '';
    }

    // Group by count (1, 2, 3)
    const byCount: { [count: number]: DeckEntry[] } = { 1: [], 2: [], 3: [] };

    entries.forEach(entry => {
      const c = Math.min(3, entry.count); // cap at 3
      if (c >= 1 && c <= 3) {
        byCount[c].push({ ...entry, count: c });
      }
    });

    // Sort each group by card ID (alphabetical deckCodeId) for consistent encoding
    Object.keys(byCount).forEach(count => {
      byCount[+count].sort((a, b) => (a.card.deckCodeId ?? '').localeCompare(b.card.deckCodeId ?? ''));
    });

    let code = 'SP'; // prefix

    // 1-of cards: count (base26) + IDs
    const count1 = byCount[1].length;
    code += this.numberToBase26(count1, 2); // 2 chars
    byCount[1].forEach(entry => {
      code += entry.card.deckCodeId; // 2 chars each
    });

    // 2-of cards
    const count2 = byCount[2].length;
    code += this.numberToBase26(count2, 2);
    byCount[2].forEach(entry => {
      code += entry.card.deckCodeId;
    });

    // 3-of cards
    const count3 = byCount[3].length;
    code += this.numberToBase26(count3, 2);
    byCount[3].forEach(entry => {
      code += entry.card.deckCodeId;
    });

    console.log(`Encoded deck: ${code} (${entries.reduce((s, e) => s + e.count, 0)} cards)`);
    return code;
  }

  // Helper: convert number to 2-char base-26 (A-Z = 0-25)
  private numberToBase26(num: number, digits: number = 2): string {
    let result = '';
    let n = num;
    while (digits-- > 0 || n > 0) {
      result = String.fromCharCode(65 + (n % 26)) + result; // A=0, B=1, ..., Z=25
      n = Math.floor(n / 26);
    }
    return result.padStart(2, 'A'); // pad with A (0) if needed
  }

  generateRandomDeckCode(attributes: string[]): string {
    // Get all cards matching the two attributes + neutral
    const attrA = attributes[0];
    const attrB = attributes[1] || null; // some classes are mono

    const cardsA = this.getCardsByAttribute(attrA);
    //console.log('cards a length: ', cardsA.length);
    const cardsB = attrB ? this.getCardsByAttribute(attrB) : [];
    //console.log('cards b length: ', cardsB.length);
    const cardsNeutral = this.getCardsByAttribute('N');
    //console.log('cards n length: ', cardsNeutral.length);
    const cardsDual = attrB ? this.getCardsByAttributes(attrA, attrB) : []; // cards with both attrA and attrB

    //console.log('cards a/b length: ', cardsDual.length);

    // Build deck with approximate ratios
    const deckCards: { card: Card; count: number }[] = [];

    // 40% attrA
    this.addRandomCards(deckCards, cardsA, 20); // ~40% of 30-card deck

    // 40% attrB (if dual class)
    if (attrB) {
      this.addRandomCards(deckCards, cardsB, 20);
    }

    // 10% dual-attribute
    this.addRandomCards(deckCards, cardsDual, 4);

    // 10% neutral
    this.addRandomCards(deckCards, cardsNeutral, 6);

    // Fill to ~30 cards if needed (adjust ratios as desired)
    while (deckCards.reduce((sum, e) => sum + e.count, 0) < 50) {
      const pool = Math.random() < 0.5 ? cardsA : (attrB ? cardsB : cardsNeutral);
      this.addRandomCards(deckCards, pool, 1);
    }

    console.log('random deck has: ', deckCards);

    // Convert to deck code (you need your deck code encoder)
    const deckCode = this.encodeDeckCode(deckCards);
    return deckCode;
  }

  private addRandomCards(target: { card: Card; count: number }[], pool: Card[], howMany: number) {
    for (let i = 0; i < howMany; i++) {
      const card = this.utilityService.random(pool);
      const existing = target.find(e => e.card.id === card.id);
      if (existing && existing.count < 3) {
        if (!card.unique) existing.count++;
      } else if (!existing) {
        target.push({ card, count: 1 });
      }
    }
  }

  // Optional: If you want to allow lookup by name or other ID in the future
  getCardByName(name: string): Card | undefined {
    return this.cards.find(card => card.name.toLowerCase() === name.toLowerCase());
    }

  getCardById(id: string): Card | undefined {
    if (id === 'randomCreature') {
      return this.getRandomCreatureByCost(20,'max');
    }
    return this.cardById.get(id);
  }

  get customSetsAllowed(): boolean {
    const customSaved = localStorage.getItem('TESL_CustomSets');
    if (customSaved) return customSaved === 'true';
    return false;
  }

  get morrowindSetsAllowed(): boolean {
    const customSaved = localStorage.getItem('TESL_Morrowind');
    if (customSaved) return customSaved === 'true';
    return false;
  }

  getRandomCardByCost(cost: number, comparison: string): Card | undefined {
    const allCards = Array.from(this.cards.values());
    const matching = allCards.filter(card => { 
      if (card.deckCodeId === null || 
        card.deckCodeId === undefined || 
        card.set === 'Story Set') {
        return false; // skip cards without deckCodeId (e.g. generated tokens)
      }
      if (!this.customSetsAllowed && card.set === 'Custom Set') return false;
      if (!this.morrowindSetsAllowed && ['Houses of Morrowind','Clockwork City',
          'Forgotten Hero Collection'].includes(card.set)) return false;
      if (comparison === 'equal') {
        if (!(card.cost === cost)) {
          return false;
        }
      } else if (comparison === 'max') {
        if (card.cost > cost) {
          return false;
        }
      }
      // If we got here → card matches
      return true;
    });

    if (matching.length === 0) {
      //return the ancient-giant
      return this.getCardById('ancient-giant');
    }

    // Pick one randomly
    return this.random(matching);
  }

  getRandomCreatureByCost(cost: number, comparison: string, rarity?: string, attribute?: string): Card | undefined {
    const allCards = Array.from(this.cards.values());
    const matching = allCards.filter(card => { 
      if (card.deckCodeId === null || card.deckCodeId === undefined|| 
        card.set === 'Story Set') {
        return false; // skip cards without deckCodeId (e.g. generated tokens)
      }
      if (!this.customSetsAllowed && card.set === 'Custom Set') return false;
      if (!this.morrowindSetsAllowed && ['Houses of Morrowind','Clockwork City',
          'Forgotten Hero Collection'].includes(card.set)) return false;
      if (card.type !== 'Creature') {
        return false;
      }
      if (comparison === 'equal') {
        if (!(card.cost === cost)) {
          return false;
        }
      } else if (comparison === 'max') {
        if (card.cost > cost) {
          return false;
        }
      }
      if (rarity && card.rarity !== rarity) {
        return false;
      }
      if (attribute && !card.attributes.includes(attribute)) {
        return false;
      }
      // If we got here → card matches
      return true;
    });

    if (matching.length === 0) {
      //return the ancient-giant
      return this.getCardById('ancient-giant');
    }

    // Pick one randomly
    return this.random(matching);
  }

  getRandomCardBySubtypes(subtypes: string[], cost?: number): Card | undefined {
    if (!subtypes || subtypes.length === 0) {
      console.warn("getRandomCardBySubtypes called with empty subtypes");
      return undefined;
    }

    // Normalize subtypes (optional, but helps with consistency)
    const normalizedSubtypes = subtypes.map(s => s.trim());

    const requestedTypes = normalizedSubtypes.filter(t =>
      ["Creature", "Item", "Support", "Action"].includes(t)
    );

    const requestedKeywords = normalizedSubtypes.filter(t =>
      ["Guard", "Rally", "Lethal", "Charge"].includes(t)
    );

    const requestedSubtypes = normalizedSubtypes.filter(t =>
      !["Creature", "Item", "Support", "Action", 
        "Guard", "Rally", "Lethal", "Charge"].includes(t)
    );

    // Get all cards
    const allCards = Array.from(this.cards.values());

    // Filter cards
    const matching = allCards.filter(card => {
      if (card.deckCodeId === null || card.deckCodeId === undefined|| 
        card.set === 'Story Set') {
        return false; // skip cards without deckCodeId (e.g. generated tokens)
      }
      if (!this.customSetsAllowed && card.set === 'Custom Set') return false;
      if (!this.morrowindSetsAllowed && ['Houses of Morrowind','Clockwork City',
          'Forgotten Hero Collection'].includes(card.set)) return false;
      // 1. Match on card.type if any type was requested
      if (requestedTypes.length > 0) {
        if (!requestedTypes.includes(card.type)) {
          return false;
        }
      }

      // 2. Match on subtypes (only if subtypes were requested)
      if (requestedSubtypes.length > 0) {
        if (!card.subtypes?.some(sub => requestedSubtypes.includes(sub))) {
          return false;
        }
      }

      if (requestedKeywords.length > 0) {
        if (!card.keywords?.some(sub => requestedKeywords.includes(sub))) {
          return false;
        }
      }

      if (cost) {
        if (!(card.cost === cost)) {
          return false;
        }
      }

      // If we got here → card matches
      return true;
    });

    if (matching.length === 0) {
      console.warn(`No card found matching criteria: ${subtypes.join(', ')}`);
      return undefined;
    }

    // Pick one randomly
    return this.random(matching);
  }

  getRandomCardByNames(names: string[], cost?: number): Card | undefined {
    if (!names || names.length === 0) {
      console.warn("getRandomCardByNames called with empty names");
      return undefined;
    }

    // Normalize names (optional, but helps with consistency)
    const normalizedNames = names.map(s => s.trim());

    // Get all cards
    const allCards = Array.from(this.cards.values());

    // Filter cards
    const matching = allCards.filter(card => {
        const cardNameLower = card.id.toLowerCase();

        const matchesRequestedName = normalizedNames.some(name =>
          cardNameLower === name.toLowerCase()
        );

        if (!matchesRequestedName) {
          return false;
        }

      if (cost) {
        if (!(card.cost === cost)) {
          return false;
        }
      }

      // If we got here → card matches
      return true;
    });

    if (matching.length === 0) {
      console.warn(`No card found matching criteria: ${names.join(', ')}`);
      return undefined;
    }

    // Pick one randomly
    return this.random(matching);
  }

  private random<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick random from empty array');
    }
    const index = Math.floor(Math.random() * array.length);
    return array[index];
  }

  private base26ToNumber(str: string): number {
    if (str.length !== 2) throw new Error('Count code must be 2 letters');

    const high = this.letterToValue(str.charAt(0));
    const low = this.letterToValue(str.charAt(1));

    return high * 26 + low;
  }

  private letterToValue(char: string): number {
    const code = char.charCodeAt(0);
    if (code >= 65 && code <= 90) { // A-Z
        return code - 65;
    } else if (code >= 97 && code <= 122) { // a-z
        return code - 97;
    }
    throw new Error(`Invalid letter in count: ${char}`);
  }

  /**
   * Custom Base64 decode (ESL uses standard Base64 but sometimes with tweaks)
   */
  private base64ToBytes(base64: string): number[] {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return Array.from(bytes);
  }

  // Helper to get full deck code info
  getDeckInfo(deckCode: string): { class: string; cards: DeckEntry[] } | null {
    const cards = this.decodeDeckCode(deckCode);
    if (!cards) return null;

    // You can map classCode to class name if you want
    return {
      class: 'Unknown', // TODO: map class code to name (e.g. 'Mm' → 'Mage')
      cards
    };
  }

  cloneCardForGame(original: Card, opponent: boolean): Card {
    return {
      ...original,
      instanceId: crypto.randomUUID(),
      prophecy: original.prophecy ?? false,
      isOpponent: opponent,
      subtypes: [...(original.subtypes || [])],
      attributes: [...(original.attributes || [])],
      currentAttack: original.attack ?? 0,
      currentHealth: original.health ?? 0,
      maxHealth: original.health ?? 0,
      currentCost: original.cost ?? 0,
      currentKeywords: [...(original.keywords || [])],
      attachedItems: [],
      effects: [...(original.effects || [])],
      // TREASURE HUNT - Proper deep clone
      treasureHunt: original.treasureHunt 
        ? {
            requirements: original.treasureHunt.requirements.map(req => ({
              ...req
            })),
            completed: false
          }
        : undefined,
      immunity: [...(original.immunity || [])],
      attacks: original.attacksPerTurn ?? 1,
      covered: false,
      shackled: false,
      frozen: false,
      silenced: false,
      sick: true,
      laneIndex: undefined,
    };
  }

  private deserializeCards(savedCards: any[], isOpponent: boolean): Card[] {
      
      const cards: Card[] = [];
      for (const sCard of savedCards) {
        const template = this.getCardById(sCard.id);
        if (!template) {
          console.warn(`Card template not found on restore: ${sCard.id}`);
          continue;
        }
  
        const restored = this.cloneCardForGame(template, isOpponent);
  
        // Overwrite with saved runtime state
        restored.instanceId = sCard.instanceId;
        restored.isOpponent = sCard.isOpponent;
        restored.laneIndex = sCard.laneIndex;
        restored.currentAttack = sCard.currentAttack;
        restored.currentHealth = sCard.currentHealth;
        restored.maxHealth = sCard.maxHealth;
        restored.sick = sCard.sick;
        restored.frozen = sCard.frozen;
        restored.attacks = sCard.attacks;
        restored.attacksPerTurn = sCard.attacksPerTurn;
        restored.covered = sCard.covered;
        restored.shackled = sCard.shackled;
        restored.silenced = sCard.silenced;
        restored.currentKeywords = [...sCard.currentKeywords];
        if (sCard.attributes) restored.attributes = [...sCard.attributes];
        if (sCard.subtypes) restored.subtypes = [...sCard.subtypes];
        restored.tempAttack = sCard.tempAttack;
        restored.tempHealth = sCard.tempHealth;
        restored.tempKeywords = [...sCard.tempKeywords];
        restored.currentCost = sCard.currentCost;
        restored.uses = sCard.uses;
        restored.activations = sCard.activations;
        restored.counter = sCard.counter;
        restored.staticBuffApplied = sCard.staticBuffApplied;
        restored.scaleDamage = sCard.scaleDamage;
        restored.immunity = [...(sCard.immunity || [])];
        restored.attachedItems = sCard.attachedItems?.map((item: any) => this.deserializeCard(item, isOpponent)) || [];

        // === TREASURE HUNT DESERIALIZATION ===
        if (sCard.treasureHunt) {
          restored.treasureHunt = {
            requirements: sCard.treasureHunt.requirements.map((req: any) => ({
              type: req.type,
              subtype: req.subtype,
              required: req.required,
              found: req.found
            })),
            completed: sCard.treasureHunt.completed
          };          
        }
  
        cards.push(restored);
      }
      return cards;
    }

  private deserializeCard(saved: SavedCard, isOpponent: boolean): Card {
    const template = this.getCardById(saved.id);
    if (!template) return null as any;

    const card = this.cloneCardForGame(template, isOpponent);
    card.instanceId = saved.instanceId;
    return card;
  }

  async restorePlayer(player: PlayerState, saved: SavedPlayerState, isOpponent: boolean) {
    player.health = saved.health;
    player.maxMagicka = saved.maxMagicka;
    player.currentMagicka = saved.currentMagicka;
    player.runes = [...saved.runes];

    // Rebuild arrays from card IDs
    player.hand = this.deserializeCards(saved.hand, isOpponent);
    player.deck = this.deserializeCards(saved.deck, isOpponent);
    player.discard = this.deserializeCards(saved.discard, isOpponent);
    player.support = this.deserializeCards(saved.support, isOpponent);
    player.board = [
      this.deserializeCards(saved.board[0], isOpponent),
      this.deserializeCards(saved.board[1], isOpponent)
    ];

    // Restore auras exactly as saved
    player.auras = saved.auras.map(sAura => {
      if (!this.isValidAuraType(sAura.type)) {
        console.warn(`Invalid aura type on restore: ${sAura.type}`);
        return null; // or skip, or default to a safe type
      }

      const sourceCard = this.deserializeCard(sAura.sourceCard, isOpponent);
      let targetFilter: (target: Card) => boolean;

      if (sAura.isHandAura) {
        targetFilter = this.createHandAuraTargetFilter(sAura.sourceEffect, sourceCard);
      } else if (sAura.isPlayerAura) {
        targetFilter = () => false;  // or proper player-level filter
      } else {
        targetFilter = this.createAuraTargetFilter(sAura.sourceEffect, sourceCard);
      }
      return {
        sourcePlayer: sAura.sourcePlayer,
        sourceInstanceId: sAura.sourceInstanceId,
        sourceCard,
        sourceEffect: sAura.sourceEffect,
        type: sAura.type,
        targetType: sAura.targetType,
        amount: sAura.amount,
        modAttack: sAura.modAttack,
        modHealth: sAura.modHealth,
        keywordsToAdd: sAura.keywordsToAdd,
        isPlayerAura: sAura.isPlayerAura,
        isHandAura: sAura.isHandAura,
        affectsOpponentHand: sAura.affectsOpponentHand,
        appliedTo: new Set(sAura.appliedTo),
        targetFilter
        } as AuraEffect
    })
    .filter((aura): aura is AuraEffect => aura != null);

    player.cardUpgrades = saved.upgrades ? {...saved.upgrades} : {};
    player.playCounts = saved.counts ? { ...saved.counts}: {};
    player.summonCounts = saved.summonCounts ? { ...saved.summonCounts}: {};

    player.turn =  saved.turn;
    player.diedLane = [...saved.diedLane];
    player.damageLane = saved.damageLane ? [...saved.damageLane] : [0, 0];
    player.damageTaken = saved.damageTaken;
    player.numSummon = saved.numSummon;
    player.actionsPlayed = saved.actionsPlayed;
    player.cardsPlayed = saved.cardsPlayed;
    player.cardsDrawn = saved.cardsDrawn;
    player.tempCost = saved.tempCost;
    player.hasWard = saved.hasWard ?? false;
    player.deckUnique = saved.deckUnique ?? false;
  }

  serializePlayer(player: PlayerState): SavedPlayerState {
    return {
      health: player.health,
      maxMagicka: player.maxMagicka,
      currentMagicka: player.currentMagicka,
      runes: [...player.runes],
      hand: player.hand.map(c => this.serializeCard(c)),
      deck: player.deck.map(c => this.serializeCard(c)),
      discard: player.discard.map(c => this.serializeCard(c)),
      support: player.support.map(c => this.serializeCard(c)),
      board: player.board.map(lane => lane.map(c => this.serializeCard(c))),
      auras: player.auras?.map(a => ({
        sourcePlayer: a.sourcePlayer,
        sourceInstanceId: a.sourceInstanceId,
        sourceCard: this.serializeCard(a.sourceCard),
        sourceEffect: a.sourceEffect,
        type: a.type,
        amount: a.amount,
        modAttack: a.modAttack,
        modHealth: a.modHealth,
        keywordsToAdd: a.keywordsToAdd,
        isPlayerAura: a.isPlayerAura,
        isHandAura: a.isHandAura,
        affectsOpponentHand: a.affectsOpponentHand,
        appliedTo: Array.from(a.appliedTo || []),
        targetType: a.targetType || 'unknown',           // if you stored original target        
      })) || [],
      upgrades: { ...player.cardUpgrades},
      counts: { ...player.playCounts},
      summonCounts: { ...player.summonCounts},
      turn: player.turn,
      diedLane: [...player.diedLane],
      damageLane: [...player.damageLane],
      damageTaken: player.damageTaken,
      numSummon: player.numSummon,
      actionsPlayed: player.actionsPlayed,
      cardsPlayed: player.cardsPlayed,
      cardsDrawn: player.cardsDrawn,
      tempCost: player.tempCost,
      hasWard: player.hasWard,
      deckUnique: player.deckUnique
    };
  }

  serializeCard(card: Card): any {
    return {
      id: card.id,
      instanceId: card.instanceId,
      isOpponent: card.isOpponent,
      laneIndex: card.laneIndex,
      currentAttack: card.currentAttack,
      currentHealth: card.currentHealth,
      maxHealth: card.maxHealth,
      currentKeywords: [...(card.currentKeywords || [])],
      attributes: [...(card.attributes || [])],
      subtypes: [...(card.subtypes || [])],
      tempAttack: card.tempAttack ?? 0,
      tempHealth: card.tempHealth ?? 0,
      tempKeywords: [...(card.tempKeywords || [])],
      sick: card.sick,
      attacks: card.attacks,
      covered: card.covered,
      shackled: card.shackled,
      frozen: card.frozen,
      silenced: card.silenced,
      attacksPerTurn: card.attacksPerTurn,
      immunity: [...(card.immunity || [])],
      attachedItems: card.attachedItems?.map(item => this.serializeCard(item)) || [],
      currentCost: card.currentCost,
      uses: card.uses,
      counter: card.counter ?? 0,
      activations: card.activations,
      staticBuffApplied: card.staticBuffApplied ?? 0,
      scaleDamage: card.scaleDamage ?? 0,

      // === TREASURE HUNT SERIALIZATION ===
      treasureHunt: card.treasureHunt ? {
        requirements: card.treasureHunt.requirements.map(req => ({
          type: req.type,
          subtype: req.subtype,
          required: req.required,
          found: req.found
        })),
        completed: card.treasureHunt.completed
      } : undefined
      //,tempCostAdjustment: card.tempCostAdjustment,
    };
  }

  isValidAuraType(type: string): type is AuraEffect['type'] {
    const validTypes = [
      'destroy', 'transform', 'move', 'summon', 'maxMagicka', 'damage', 'heal',
      'buffSelf', 'buffTarget', 'drawCards', 'addToHand', 'silence', 'unsummon',
      'choice', 'shackle', /* ... add ALL your allowed types here ... */
      'modCost', 'equipDiscard', 'extraAttack', 'grantImmunity', 'magickaLimit', 'pilferSlay' // etc.
    ] as const;

    return validTypes.includes(type as any);
  }

  createAuraTargetFilter(effect: CardEffect, sourceCard: Card): (target: Card) => boolean {
    const targetType = effect.target as TargetType | undefined;
    
    return (targetCard: Card) => {
      // Basic requirements — must always be true
      if (effect.target?.startsWith("support")) {
        if (targetCard.type !== 'Support') return false;
      } else {
        if (targetCard.type !== 'Creature') return false;
      }
      if (targetCard.isOpponent !== sourceCard.isOpponent) return false;
      // Most auras should not buff the source card itself
      const shouldExcludeSelf = targetType?.includes('Other') ?? true;
      // Now decide based on scope
      const isSameLane = targetCard.laneIndex === sourceCard.laneIndex;

      if (shouldExcludeSelf && targetCard.instanceId === sourceCard.instanceId) {
        return false;
      }
      if (effect.targetCondition) {
        console.log('checking target condition for aura');
        if (!this.isTargetConditionMet(targetCard, effect.targetCondition, sourceCard)) return false;
      }

      if (!targetType) {
        // No target specified → default to same-lane other
        return isSameLane;
      }
      if (targetType.includes('ThisLane')) {
        // Lane-restricted auras
        return isSameLane;
      }
      // Everything else = global friendly
      return true;
    };
  }

  createHandAuraTargetFilter(effect: CardEffect, sourceCard: Card): (target: Card) => boolean {
    return (targetCard: Card) => {
      if (effect.targetCondition) {
        return this.isTargetConditionMet(targetCard, effect.targetCondition);
      }
      return true;
    };
  }

  isTargetConditionMet(target: Card, condition?: CardEffect['targetCondition'], sourceCard?: Card, ignoreOtherEffects?: boolean): boolean {
    if (!condition) {
      return true; // no condition = always allowed
    }

    switch (condition.type) {
      case 'notMostPowerful': 
        return true; //handled in executeEffect
      case 'isUnique':
        return target.unique === true;
      case 'isExalted':
        return target.exalted === true;
      case 'sameLaneAsSource':
        if (sourceCard === undefined || sourceCard.laneIndex === undefined || 
          target.laneIndex === undefined) return false;
        return sourceCard.laneIndex === target.laneIndex;

      case 'hasLessAttack': {
        if (sourceCard) {
          let refAttack = sourceCard.currentAttack ?? sourceCard.attack ?? 0;
          if (sourceCard.exalted && ignoreOtherEffects === undefined) {
            sourceCard.effects?.forEach(effect => {
              if (effect.trigger === 'Exalt' && effect.type === 'buffSelf') {
                refAttack += (effect.modAttack ?? 0);
              }
            });
          }
          return (target.currentAttack ?? target.attack ?? 0) < refAttack;
        }
        return false;
      }

      case 'hasType':
        if (!condition.subtypes?.length) return false;
        return condition.subtypes!.includes(target.type);

      case 'hasSubtype':
        if (!condition.subtypes?.length) return false;
        return (target.subtypes?.some(sub => condition.subtypes!.includes(sub)) || 
          target.subtypes.includes('All')) ?? false;
      
      case 'hasNoKeywords': {
        if ((target.currentKeywords || []).length === 0) return true;
        return !(target.currentKeywords!.some(kw => 
          [...this.keywordList,'LastGasp','Pilfer','Slay','TreasureHunt','BeastForm'].includes(kw)));
      }

      case 'hasKeyword':
        if (!condition.keyword) return false;
        return target.currentKeywords?.includes(condition.keyword) ?? false;

      case 'hasAttribute':
        if (!condition.attribute) return false;
        return target.attributes?.includes(condition.attribute) ?? false;

      case 'hasName':
        if (!condition.names?.length) return false;
        return condition.names!.some(sub => sub === target.id) ?? false;

      case 'hasAttack':        
        const minAttack = condition.min ?? -99;
        const maxAttack = condition.max ?? 99;
        return (target.currentAttack ?? 0) <= maxAttack && (target.currentAttack ?? 0) >= minAttack;
      
      case 'isWounded':
        return this.isWounded(target);

      default:
        console.warn(`Unknown targetCondition type: ${condition.type}`);
        return true; // safe default
    }
  }

  getEffectiveType(card: Card): string {
    if (card.type === 'Item' && card.effects?.some(e => e.trigger === 'Play')) {
      return 'Action';
    }
    return card.type;
  }

  isWounded(card: Card): boolean {
    if (card.type !== 'Creature') return false;
    if (card.currentHealth !== card.maxHealth) return true;
    if ((card.maxHealth ?? 0) < (card.health ?? 0)) return true;
    return false;
  }

}