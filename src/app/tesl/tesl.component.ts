//tesl.component.ts
import { Component, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { DeckService, ChoiceOption, CardEffect
  , PlayerState, AuraEffect, SavedGameState
, GameState, HistoryEntry, PendingAction, SavedDeck
, DeckOption, DeckSource } from './deck.service';
import { UtilityService, HelpRule } from './utility.service';
import { GameService } from './game.service';
import { Card, TargetType } from './deck.service';
import { AudioService } from './audio.service';
import { SwUpdate } from '@angular/service-worker';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { CollectionViewerComponent } from '../collection/collection.component';
import { DeckBuilderComponent } from '../deck-builder/deck-builder.component';
import { ArenaDraftComponent, ArenaOpponent } from '../arena-draft/arena-draft.component';
import { RankedComponent } from '../ranked/ranked.component';

// Grouped by turn
interface TurnHistory {
  turnNumber: number;
  entries: HistoryEntry[];
  isExpanded: boolean;      // ← new: controls accordion
}

interface CardHeader {
  id: string;
  name: string;
  set: string;
}

interface CardHighlightState {
  playable: boolean;
  attackable: boolean;
  activatable: boolean;
  targetable: boolean;
  selected: boolean;
}

interface GameOverrides {
  deckCode?: string;
  playerdeck?: string[];
  opponentdeck?: string[];
  cards?: number;
  health?: number;
  runes?: number;
  firstPlayer?: string;
  lanes?: string[];
  board?: string[][];
  playerBoard?: string[][];
  support?: string[];
  playerSupport?: string[];
  startingHand?: number;
  forcedDraw?: boolean;
  special?: string;
  maxMagicka?: number;
  mulligan?: boolean;
  playerMaxMagicka?: number;
  playerHand?: string[];
  oppCards?: number;

}

// Deck source types


// Unified deck option interface


@Component({
  selector: 'app-tesl',
  templateUrl: './tesl.component.html',
  styleUrls: ['./tesl.component.scss']
})
export class TeslComponent implements OnInit {

  isDesktopMode = false;   // default = mobile style
  animationsEnabled = true;
  tempOverrides: GameOverrides = {};

  game: GameState = {
        player: {
        health: 30,
        currentMagicka: 0,
        maxMagicka: 0,
        hand: [],
        board: [[], []],
        support: [],
        deck: [],
        discard: [],
        limbo: [],
        runes: [true, true, true, true, true],
        auras: [],
        cardUpgrades: {},
        playCounts: {},
        turn: true,
        diedLane: [0, 0],
        damageTaken: 0,
        numSummon: 0,
        actionsPlayed: 0,
        cardsPlayed: 0,
        cardsDrawn: 0,
        tempCost: 0,
      },
      opponent: {
        health: 30,
        currentMagicka: 0,
        maxMagicka: 0,
        hand: [],
        board: [[], []],
        support: [],
        deck: [],
        discard: [],
        limbo: [],
        runes: [true, true, true, true, true],
        auras: [],
        cardUpgrades: {},
        playCounts: {},
        turn: false,
        diedLane: [0, 0],
        damageTaken: 0,
        numSummon: 0,
        actionsPlayed: 0,
        cardsPlayed: 0,
        cardsDrawn: 0,
        tempCost: 0
      },
      laneTypes: ['Field','Shadow'],
      history: [],
      gameRunning: false,
      pendingActions: [],
      firstPlayer: Math.random() < 0.5 ? 'player' : 'opponent',
      currentRound: 0,
      currentTurn: 0,
      cpuPlaying: true,
      classicTargeting: true,
      tempCostAdjustment: 0,
      targetLaneRequired: false,
      stagedCard: null,
      stagedAttack: null,
      stagedSummon: null,
      stagedSummonEffect: null,
      stagedProphecy: null,
      stagedSupportActivation: null,
      stagedAction: 'none',
      creatureSlain: null,
      creatureSlayer: null,
      creatureShackled: null,
      thief: null,
      creatureMoved: null,
      creatureRevealed: null,
      lastCardPlayed: null,
      lastCardDrawn: null,
      lastCardSummoned: null,
      lastCardSummoned2: null,
      lastCardDealingDamage: null,
      lastCardReceivingDamage: null,
      lastCreatureTargeted: null,
      lastCardEquipped: null,
      lastDamageTaken: 0,
      lastHealingTaken: 0,
      healthJustGained: 0,
      isProcessingDeath: false,
      isProcessingEndOfTurn: false,
      waitingOnScry: false,
      waitingOnAnimation: false,
      useAnimation: false,
      simulating: false
    };

  attributeIcons: { [key: string]: string } = {
    'R': 'LG-icon-Strength.png',
    'Y': 'LG-icon-Willpower.png',
    'P': 'LG-icon-Endurance.png',
    'B': 'LG-icon-Intelligence.png',
    'G': 'LG-icon-Agility.png',
    'N': 'LG-icon-Neutral.png'
    // Add more if needed (e.g. dual/tri attributes)
  };

  readonly lanes = [
    { name: 'Disabled', description: 'Cards may not be summoned here.'},
    { name: 'Field', description: 'No special rules for this lane.'},
    { name: 'Shadow', description: `Creatures entering this lane gain Cover and can't can't be attacked for one turn.`},
    { name: 'Windy', description: `At the end of your opponent's turn, a random creature switches lanes.`},
    { name: 'Plunder', description: 'After a creature is summoned here, attach a random item to it.'},
  ];

  readonly classes = [
    { name: 'Archer', race: 'Woodelf', attributes: ['R','G'], color: '#ff4444' },
    { name: 'Assassin', race: 'Darkelf', attributes: ['B','G'], color: '#0066ff' },
    { name: 'Battlemage', race: 'Redguard', attributes: ['R','B'], color: '#ffcc00' },
    { name: 'Crusader', race: 'Nord', attributes: ['R','Y'], color: '#00cc66' },
    { name: 'Mage', race: 'Highelf', attributes: ['B','Y'], color: '#cc66ff' },
    { name: 'Monk', race: 'Khajiit', attributes: ['Y', 'G'], color: '#9966ff' },
    { name: 'Scout', race: 'Argonian', attributes: ['G', 'P'], color: '#ff6666' },
    { name: 'Sorcerer', race: 'Breton', attributes: ['B', 'P'], color: '#ff9900' },
    { name: 'Spellsword', race: 'Imperial', attributes: ['Y', 'P'], color: '#66cc99' },
    { name: 'Warrior', race: 'Orc', attributes: ['R', 'P'], color: '#6699ff' },
  ];

  // Deck definition (expand this list as needed)
  starterDecks: DeckOption[] = [];      // populated from unlocked story rewards
  npcDecks: DeckOption[] = [];
  randomDeckOptions: DeckOption[] = [];
  customDecks: DeckOption[] = [];       // empty for now
  
  playerDeckMode: DeckSource = 'starter';
  opponentDeckMode: DeckSource = 'starter';
  selectedPlayerDeck: DeckOption | null = this.starterDecks[0];
  selectedOpponentDeck: DeckOption | null = this.starterDecks[0];
  expandedDeckSide: 'player' | 'opponent' | null = null;
  // Player / Opponent deck selection
  //selectedPlayerDeckSource: DeckSource = 'starter';
  //selectedPlayerClassIndex: number | null = null;

  selectedOpponentDeckSource: DeckSource = 'starter';

  selectedSet: string = 'Core Set';  // default

  // List of available sets (add more as you have expansions)
  readonly availableSets = [
    'All Sets',
    'Core Set',
    'Heroes of Skyrim',
    'Dark Brotherhood',
    'Madhouse Collection',
    'Monthly Reward',
    'Story Set',
    'Custom Set'
    // 'Return to Clockwork City', etc.
  ];  

  private setFolders: Record<string, string> = {
    'Core Set': 'core_set',
    'Dark Brotherhood': 'brotherhood',
    'Heroes of Skyrim': 'heroes_of_skyrim',
    'Madhouse Collection': 'madhouse',
    'Monthly Reward': 'reward_set',
    'Story Set': 'story_set',
    'Custom Set': 'custom_set'
  };

  private storyHints = [
    [
      `Welcome to The Elder Scrolls: Legends. The object of the game is to defeat your opponent. You do this by playing cards from your deck.`,
      `Reduce your opponent's health to zero to win`,
      `Most games have two lanes. Creatures can only attack enemy creatures in the same lane.`,
      `When creatures fight, they deal damage equal to their power.`,
      `When creatures battle, each damages the other.`,
      `Play items like heavy battleaxe to improve one of your creatures.`
    ],
    [
      `You will use magicka to play your cards.`,
      `Your magicka increases by one each turn.`,
      `Creatures played to a shadow lane gain cover for a turn. Creatures with cover can't be attacked.`,
      `Actions provide one-shot abilities.`
    ],
    [
      `When you go second, you start the game with a ring of magicka. Select it when you want to use it for a temporary magicka boost.`,
      `For every five health you lose, you'll lose a rune and draw a card.`,
      `Guards must be destroyed before you can attack other enemies in their lane.`,
      `If you draw a prophecy card when you lose a rune, you may play it for free.`,
      `Support cards once played are permanent and provide ongoing benefits.`
    ],
    [
      `Lethal creatures kill any creature they deal damage to.`,
      `Charge creatures can attack immediately.`
    ],
    [
      `Your opponent comes to battle with defenses ready.`
    ]
  ]

  private isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints 

  private bodyScrollLocked = false;

  @ViewChild('musicPlayer') musicPlayer!: ElementRef<HTMLAudioElement>;

  musicVolume: number = 0.25;           // 0.0 to 1.0 – adjust to taste
  private currentMusicUrl: string | null = null;

  showMagickaOverlay = false;
  showSettingsOverlay = false;
  showPlayerClassSelector = false;
  showOpponentClassSelector = false;
  showPlayerDeckSelector = false;
  showOpponentDeckSelector = false;

  showChoiceModal = false;
  currentChoiceEffect: CardEffect | null = null;
  currentChoiceSource: Card | null = null;
  currentChoiceOptions: ChoiceOption[] = [];
  selectedChoiceIndex: number | null = null;
  choiceFollowupEffect: CardEffect | null = null;

  showRevealOverlay = false;
  revealCards: Card[] = [];           // cards to show
  revealTitle = '';                   // "Reveal 3 cards" or "Top of opponent's deck"
  revealAction = '';                  // "Choose one to draw" or empty
  revealCallback: ((selectedIndex?: number) => void) | null = null;  // for choice mode
  revealTimeout: any = null;
  revealIsOpponent = false;           // for positioning

  // You'll need to track these values somewhere in your game logic
  //history: HistoryEntry[] = [];
  groupedHistory: TurnHistory[] = [];   // ← new: grouped + expanded state
  //currentRound = 1;      // increment at the start of each full round
  //currentTurn = 1;       // increment every time turn changes
  showHistoryModal = false;
  showDiscardModal = false;
  showHandModal = false;
  discardView: 'player' | 'opponent' = 'player';
  handView: 'player' | 'opponent' = 'player';
  //laneTypes = ['Shadow','Field'];

  opponentLog: string[] = [];
  //gameRunning = false;
  //firstPlayer: 'player' | 'opponent' = 'player';
  cpuTogglePlaying = true;
  cpuThinking: boolean = false;
  showHelpHints = true;
  showTestInputs = false;
  classicTargeting: boolean = true;
  customSets: boolean = true;
  handicapOptions: number[] = [0, 1, 2, 3];
  oppHandicapMagicka: number = 0;
  oppHandicapCards: number = 0;
  testStartingMaxMagicka: number = 0;  // default to 1
  testStartingCard1: string = 'None';
  testStartingCard2: string = 'None';
  availableCards: CardHeader[] = [];
  collectibleCount: number = 1;
  private hintTimeout: any = null;     // timer reference
  currentHintMessage: string | null = null;  // what to show

  playerHeroImage = '/assets/tesl/images/avatars/LG-arena-Argonian_1.png';
  opponentHeroImage = '/assets/tesl/images/avatars/LG-arena-Breton_1.png';
  showAvatarModal = false;
  avatarModalFor: 'player' | 'opponent' | null = null;

  gameOverVisible = false;
  gameOverMessage = '';
  gameOverHandled: boolean = false;

  unlockOverlayVisible = false;
  unlockOverlayMessage = '';
  
  // Queue of burn messages
  burnQueue: { message: string; isOpponent: boolean, card: Card }[] = [];

  // Currently displayed burn hint
  currentBurnMessage: string | null = null;
  currentBurnIsOpponent: boolean = false;
  burnHintTimeout: any = null;
  burnHintVisible = false;  // controls *ngIf
  lastBurnedCard: Card | null = null;

  mulliganActive = false;
  mulliganCards: Card[] = [];           // the 3 cards to choose from
  mulliganToReturn: Set<string> = new Set();  // instanceIds of cards to mulligan
  mulliganPhase: 'first' | 'second' | null = null;  // NEW
  mulliganPlayer: PlayerState | null = null;

  //cancelButtonActive = false;
  //targetLaneRequired: boolean = false;

  showResumeModal: boolean = false;
  resumeTurnNumber: number = 0;

  //forceProphecyForTesting = false; // Set to true to force a prophecy card draw for testing

  showProphecyFlash = false;
  prophecyMessage = 'PROPHECY!';

  selectedCard: Card | null = null;   // currently selected card
  hoveredCard: Card | null = null;   // currently selected card

  enlargedCard: Card | null = null;
  showOpponentSupportBar = false;
  showPlayerSupportBar = false;
  handVersion = 0;

  hoverSelectEnabled = true;

  availableAvatars = [
    '/assets/tesl/images/avatars/LG-arena-Woodelf_1.png',
    '/assets/tesl/images/avatars/LG-arena-Woodelf_2.png',
    '/assets/tesl/images/avatars/LG-arena-Woodelf_3.png',
    '/assets/tesl/images/avatars/LG-arena-Woodelf_4.png',
    '/assets/tesl/images/avatars/LG-arena-Redguard_1.png',
    '/assets/tesl/images/avatars/LG-arena-Redguard_2.png',
    '/assets/tesl/images/avatars/LG-arena-Redguard_3.png',
    '/assets/tesl/images/avatars/LG-arena-Redguard_4.png',
    '/assets/tesl/images/avatars/LG-arena-Orc_1.png',
    '/assets/tesl/images/avatars/LG-arena-Orc_2.png',
    '/assets/tesl/images/avatars/LG-arena-Orc_3.png',
    '/assets/tesl/images/avatars/LG-arena-Orc_4.png',
    '/assets/tesl/images/avatars/LG-arena-Nord_1.png',
    '/assets/tesl/images/avatars/LG-arena-Nord_2.png',
    '/assets/tesl/images/avatars/LG-arena-Nord_3.png',
    '/assets/tesl/images/avatars/LG-arena-Nord_4.png',
    '/assets/tesl/images/avatars/LG-arena-Khajiit_1.png',
    '/assets/tesl/images/avatars/LG-arena-Khajiit_2.png',
    '/assets/tesl/images/avatars/LG-arena-Khajiit_3.png',
    '/assets/tesl/images/avatars/LG-arena-Khajiit_4.png',
    '/assets/tesl/images/avatars/LG-arena-Imperial_1.png',
    '/assets/tesl/images/avatars/LG-arena-Imperial_2.png',
    '/assets/tesl/images/avatars/LG-arena-Imperial_3.png',
    '/assets/tesl/images/avatars/LG-arena-Imperial_4.png',
    '/assets/tesl/images/avatars/LG-arena-Highelf_1.png',
    '/assets/tesl/images/avatars/LG-arena-Highelf_2.png',
    '/assets/tesl/images/avatars/LG-arena-Highelf_3.png',
    '/assets/tesl/images/avatars/LG-arena-Highelf_4.png',
    '/assets/tesl/images/avatars/LG-arena-Darkelf_1.png',
    '/assets/tesl/images/avatars/LG-arena-Darkelf_2.png',
    '/assets/tesl/images/avatars/LG-arena-Darkelf_3.png',
    '/assets/tesl/images/avatars/LG-arena-Darkelf_4.png',
    '/assets/tesl/images/avatars/LG-arena-Breton_1.png',
    '/assets/tesl/images/avatars/LG-arena-Breton_2.png',
    '/assets/tesl/images/avatars/LG-arena-Breton_3.png',
    '/assets/tesl/images/avatars/LG-arena-Breton_4.png',
    '/assets/tesl/images/avatars/LG-arena-Argonian_1.png',
    '/assets/tesl/images/avatars/LG-arena-Argonian_2.png',
    '/assets/tesl/images/avatars/LG-arena-Argonian_3.png',
    '/assets/tesl/images/avatars/LG-arena-Argonian_4.png',
    // ... add all LG-arena%.png files
  ];

  isMainMenu: boolean = true;  // Start in menu
  
  cheatCodeInput: string = '';
  cheatsActive: boolean = false;
  cheatFailCount: number = 0;
  cheatEver: boolean = false;
  activeCheat: string = 'None';

  unlockedCards: string[] = []; //unlocked deckcodes
  savedDecks: SavedDeck[] = [];
  showGameBoard: boolean = false;
  currentChapter: any = null;  // For Story mode
  currentChapterDefeated: boolean = false;
  currentChapterIndex: number = 0;
  lastCompletedChapterIndex: number = -1;
  storyDifficulty: 'normal' | 'hard' = 'normal';
  isStoryMode: boolean = false;
  isArenaMode: boolean = false;
  isRankedMode: boolean = false;
  isExhibitionMode: boolean = false;
  expandedAct: number | null = null;           // which Act is open (null = none)
  selectedChapter: any = null;                 // current chapter object
  currentVideo: string | null = null;          // path to playing video
  currentDialogue: string = '';  // holds the active dialogue HTML
  private currentVideoJustPlayed: 'start' | 'end' | null = null;

  storyChapters: any[] = [];                   // your JSON array
  arenaScenarios: any[] = [];
  arenaOpponents: DeckOption[] = [];
  arenaClass: string | null = null;
  arenaClassCards: Card[] = [];
  arenaElo: number = 1200;
  arenaWins: number = 0;
  arenaLosses: number = 0;
  arenaState: any = null;   // full saved arena state
  private readonly ARENA_STATE_KEY = 'arena_draft_state';


  // Menu options (you can make this dynamic later)
  menuOptions = [
    { name: 'Story', icon: '/assets/tesl/images/icons/LG-icon-Story.png', action: () => this.startStoryMode(), disabled: false, info: () => this.storyInfo },
    { name: 'Arena', icon: '/assets/tesl/images/icons/LG-icon-Solo_Arena.png', action: () => this.openSoloArena(), disabled: this.forcedStory, info: () => this.arenaInfo },
    { name: 'Ranked', icon: '/assets/tesl/images/icons/LG-icon-Ranked.png', action: () => this.openRanked(), disabled: this.forcedStory },
    { name: 'Exhibition', icon: '/assets/tesl/images/icons/LG-icon-Practice.png', action: () => this.startExhibition(), disabled: this.forcedStory },
    { name: 'Collection', icon: '/assets/tesl/images/icons/LG-icon-Core_Set_white.png', action: () => this.openCollection(), disabled: this.forcedStory, info: () => this.collectionInfo },
    { name: 'Decks', icon: '/assets/tesl/images/icons/cards_in_hand.png', action: () => this.openDeckBuilder(), disabled: this.forcedStory },
    { name: 'Settings', icon: '/assets/tesl/images/icons/LG-icon-Prophecy.png', action: () => this.toggleSettingsOverlay(), disabled: false }
    //{ name: 'Quit', icon: '/assets/tesl/images/icons/LG-icon-Silence.png', action: () => this.quitGame(), disabled: false }
  ];

  // Define the rule sections here
  isHelpVisible = false;
  currentHelpStep = 0;
  helpRules: HelpRule[];
  updateAvailable = false;
  appVersion = '0.4.3';

  /*
  0.2.2
    - added skyrim set, reward set, promo set, dark brotherhood
  0.1.1
    - added out-of-cards message
    - removes 20px padding in opponent-info if media height < 770px
      (consider other options)
    to-do this release: 
      skyrim set
      random decks enforcing minimum # of prophecy cards
  */
  private destroy$ = new Subject<void>();

  private highlightCache = new Map<string, CardHighlightState>();
  audioEnabled = true;
  //http: any;
  
  constructor(private deckService: DeckService, 
    private utilityService: UtilityService,
    private cdr: ChangeDetectorRef, 
    private gameService: GameService,
    private audioService: AudioService,
    private swUpdate: SwUpdate, 
    private http: HttpClient,
    private dialog: MatDialog) { 
      this.swUpdate.available.subscribe(event => {
            this.updateAvailable = true;
        });
    this.helpRules = this.utilityService.helpRules;
    gsap.registerPlugin(MotionPathPlugin);
  }

  ngOnInit(): void {
    document.addEventListener('contextmenu', event => {
      event.preventDefault();
    });
    this.randomDeckOptions = this.classes.map(cls => ({
      source: 'random',
      name: `Random ${cls.name}`,
      attributes: cls.attributes,
      class: cls.name,
      isRandom: true,
      locked: false
    }));

    forkJoin({
      story: this.http.get<any[]>('/assets/tesl/forgotten_hero.json'),
      arenaScenarios: this.http.get<any[]>('/assets/tesl/arena_scenarios.json'),
      arena: this.http.get<DeckOption[]>('/assets/tesl/arena_opponents.json'),
      starter: this.http.get<DeckOption[]>('/assets/tesl/starter_decks.json'),
      npc: this.http.get<DeckOption[]>('/assets/tesl/npc_decks.json')
    }).subscribe({
      next: ({ story, arenaScenarios, arena, starter, npc }) => {
        this.storyChapters = story;
        this.arenaScenarios = arenaScenarios;
        this.arenaOpponents = arena.map(d => this.mapToDeckOption(d,'arena'));
        this.starterDecks = starter.map(d => this.mapToDeckOption(d,'starter'));
        this.npcDecks = npc.map(d => this.mapToDeckOption(d,'npc'));
        console.log('Chapters loaded:', this.storyChapters.length);
        console.log('Arena opponents loaded:', this.arenaOpponents.length);
        console.log('Starter decks loaded:', this.starterDecks.length);
        console.log('NPC decks loaded:', this.npcDecks.length);

        this.loadDeckSelection();
        this.unlockedStarterDecks(false);
        this.unlockCustomDecks();
        this.loadArenaState();
      },
      error: (err) => {
        console.error('Failed to load deck data:', err);
      }
    });
    // Load audio manifest first (parallel with cards)
    this.audioService.loadManifest().subscribe(loaded => {
      if (loaded) {
        console.log('Audio ready');
      }
    });
    // Instead of decoding immediately, wait for cards
    this.deckService.cards$.subscribe(cards => {  // ← we'll add this observable
      if (cards.length > 0) {  // cards loaded
        // Load available cards for testing dropdown
        const allCards = this.deckService.getAllCards();
        this.collectibleCount = allCards.filter(c =>
          c.deckCodeId !== null && c.set !== 'Story Set'
        ).length;
        this.availableCards = allCards
          //.filter(card => card.type !== 'Support')  // optional filter
          .map(card => ({ id: card.id, name: card.name, set: card.set }))
          .sort((a, b) => a.name.localeCompare(b.name));        

        // Add "None" option at top
        this.availableCards.unshift({ id: 'None', name: 'None', set: 'None' });
        const resumed = this.loadGameState();
      }
    });

    
    
    this.swUpdate.available
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.updateAvailable = true;
      }
      );
  }

  ngAfterViewInit() {
    // Safe to use @ViewChild now
    const storedAudiotoggle = localStorage.getItem('TESL_Audiotoggle');
    if (storedAudiotoggle !== null) {
      this.audioEnabled = storedAudiotoggle === 'true';
    }
    this.updateBackgroundMusic();
    this.updateMusicVolume();
  }

  ngOnChanges() {
    //console.log('changes seen');
    //this.handlePendingAction(this.game.pendingAction);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    console.log('Home destroyed cleanly');
  }

  get forcedStory(): boolean {
    if (this.unlockedAll) return false;
    if (this.starterDecks.length > 0 && this.starterDecks[0].locked) return true;
    return false;
  }

  get arenaInfo(): string {
    if (this.arenaState?.wins !== undefined) {
      return `${this.arenaState.wins}-${this.arenaState.losses} Elo:${this.arenaElo}`;
    } else {
      return '';
    }
  }

  get collectionInfo(): string {
    if (this.unlockedAll) return '100%';
    const collectionPct = this.unlockedCards.length/this.collectibleCount*100;
    return `${Math.round(collectionPct)}%${this.cheatEver ? '*' : ''}`;
  }

  get storyInfo(): string {
    if (this.unlockedAll) return '100%';
    let completionPct = 0;
    const storyLength = this.storyChapters.length;
    const lastChap = this.lastCompletedChapterIndex;
    if (lastChap < 30) {
      completionPct = (Math.min(lastChap+1,storyLength))/storyLength*50;
    } else {
      completionPct = (lastChap+1-30)/storyLength*50+50;
    }
    return `${Math.round(completionPct)}%`;
  }

  private mapToDeckOption(d: any, source: string): DeckOption {
    if (source === 'arena') {
      return {
        source: 'arena', // or whatever enum/value fits
        name: d.name,
        deckCode: d.deckCodeId,
        attributes: d.attributes ?? [],
        isRandom: false,
        avatar: d.avatar,
        elo: d.elo,

        // optional fields
        description: d.theme,
      };
    } else if (source === 'starter') {
      return {
        source: 'starter',
        name: d.name,
        deckCode: d.deckCode,
        class: d.class,
        attributes: d.attributes ?? [],
        description: d.description,
        isRandom: false,
        tier: d.tier,
        locked: d.locked,
        unlockAfterChapter: d.unlockAfterChapter
      }
    } else if (source === 'custom') {
      return {
        source: 'custom',
        name: d.name,
        deckCode: d.deckCode,
        class: this.classes.find(cls =>
          cls.attributes[0] === d.attributes[0] && cls.attributes[1] === d.attributes[1]
        )?.name ?? 'Unknown',
        attributes: d.attributes,
        isRandom: false
      }
    } else {
      return {
        source: 'npc',
        name: d.name,
        deckCode: d.deckCode,
        class: d.class,
        attributes: d.attributes ?? [],
        description: d.description,
        isRandom: false,
        tier: d.tier,
        locked: true
      }
    }
  }

  get availableModes(): string[] {
    return this.isExhibitionMode
      ? ['Starter', 'Random', 'NPC', 'Custom', 'Arena']
      : ['Starter', 'Custom'];
  }

  get oppHeroImage(): string {
    if (this.isStoryMode && this.currentChapter?.avatar) {
      return '/assets/tesl/images/avatars/' + this.currentChapter.avatar;
    } else if (this.selectedOpponentDeck?.source === 'arena' && this.selectedOpponentDeck.avatar) {
      return '/assets/tesl/images/avatars/' + this.selectedOpponentDeck.avatar;
    } else {
      return this.opponentHeroImage || '/assets/tesl/images/avatars/LG-arena-Breton_1.png';
    }
  }

  get userHeroImage(): string {
    if (this.selectedPlayerDeck?.source === 'arena' && this.selectedPlayerDeck.avatar) {
      return '/assets/tesl/images/avatars/' + this.selectedPlayerDeck.avatar;
    } else {
      return this.playerHeroImage || '/assets/tesl/images/avatars/LG-arena-Argonian_1.png';
    }
  }

  // Get unlocked starter decks based on progress
  private unlockedStarterDecks(showMessage: boolean = true) {
    //console.log(`chapters completed ${this.lastCompletedChapterIndex}`);
    let unlockCount = 0;
    this.starterDecks.forEach(deck =>
    {
      //console.log(`check ${deck.name}`);
      if (deck.locked && deck.unlockAfterChapter && 
        deck.unlockAfterChapter <= this.lastCompletedChapterIndex) {
        deck.locked = false;
        this.unlockOverlayMessage = `You can now use: ${deck.name}`;
        if (showMessage) this.unlockOverlayVisible = true;
        const codes = deck.deckCode?.substring(2);
        // Split every 2 characters
        const codePairs = [];
        if (codes) {
          for (let i = 0; i < codes.length; i += 2) {
            const dc = codes.slice(i,i+2);
            if (!dc.startsWith('A') && !dc.startsWith('B')) {
              codePairs.push(codes.slice(i, i + 2));
            }
          }
        }
        // Add to unlockedCards if not already present
        codePairs.forEach(code => {
          if (!this.unlockedCards.includes(code)) {
            this.unlockedCards.push(code);
            unlockCount++;
          }
        });
      }
    });
    if (unlockCount > 0) this.saveUnlockedCards();
  }

  private unlockCustomDecks() {
    this.customDecks.forEach(deck => {
      const codes = deck.deckCode?.substring(2);
      // Split every 2 characters
      const codePairs = [];
      if (codes) {
        for (let i = 0; i < codes.length; i += 2) {
          const dc = codes.slice(i,i+2);
          if (!dc.startsWith('A') && !dc.startsWith('B')) {
            codePairs.push(codes.slice(i, i + 2));
          }
        }
      }
      deck.locked = false;
      codePairs.forEach(code => {
        if (!this.unlockedCards.includes(code)) {
          deck.locked = true;
        }
      });
    });
  }

  saveUnlockedCards() {
    localStorage.setItem('unlocked_cards', JSON.stringify(Array.from(this.unlockedCards)));
  }

  loadUnlockedCards() {
    console.log('get unlocked cards');
    const saved = localStorage.getItem('unlocked_cards');
    if (saved) {
      this.unlockedCards = JSON.parse(saved);
      console.log(`total unlocked: ${this.unlockedCards.length}`);
    }
  }

  isCardTargetable(game: GameState, card: Card, laneIndex: number): boolean {
    if (this.isLaneRequired) return false;
    if (this.showCreatureHighlights && this.isValidTarget(game,card, laneIndex)) return true;
    if (this.isAttackStaging && this.isValidTarget(game,card,laneIndex)) return true;
    if ((game.stagedAction === 'choice-followup' || 
      game.stagedAction === 'play-action' || 
      game.stagedSupportActivation !== null) && 
      this.isValidTarget(game,card, laneIndex)) return true;
    if (this.isSummonTargeting && game.stagedSummon && game.stagedSummon.laneIndex !== undefined &&
      this.isValidSummonTarget(game,card, game.stagedSummon.laneIndex)) return true;
    return false;
  }

  isHeroTargetable(game: GameState, isOpponent: boolean): boolean {
    const targetPlayer = isOpponent ? game.opponent : game.player;
    return (this.isAttackStaging && this.isValidTarget(game, targetPlayer, 0)) ||
      ((game.stagedAction === 'play-action' || game.stagedAction === 'choice-followup' || game.stagedSupportActivation !== null) && 
      this.isValidTarget(game, targetPlayer, 0)) ||
      (this.isSummonTargeting && this.isValidSummonTarget(game, targetPlayer, 0));
  }

  isLaneTargetable(game: GameState, laneIndex: number, isOpponent: boolean, full: boolean): boolean {
    if (game.laneTypes[laneIndex] === 'Disabled') return false;
    if (full) {
      return this.showOpponent === isOpponent && 
      (this.showLaneHighlights && this.isLaneFull(game,laneIndex) && !this.isLaneRequired);
    } else {
      return this.showOpponent === isOpponent && 
      ((this.showLaneHighlights && !this.isLaneFull(game,laneIndex)) || this.isLaneRequired);
    }
  }

  isHandTargetable(game: GameState, card: Card): boolean {
    if (game.stagedAction === 'play-action' && this.isValidTarget(game,card,0)) return true;
    if (game.stagedSupportActivation && this.isValidTarget(game,card,0)) return true;
    if (this.isSummonTargeting && game.stagedSummon && game.stagedSummon.laneIndex !== undefined &&
        this.isValidSummonTarget(game,card,game.stagedSummon.laneIndex)) return true;
    return false;
  }

  invalidateHighlights() {
    this.highlightCache.clear();
    this.cdr.markForCheck(); // if needed
  }

    // Computed property for filtered cards
  get filteredCards(): CardHeader[] {
    if (this.selectedSet === 'All Sets') {
      return this.availableCards; // if you have an 'All' option
    }
    return this.availableCards.filter(card => card.set === this.selectedSet || card.set === 'None');
  }

  onSetChange() {
    // Reset card selections when set changes
    this.testStartingCard1 = 'None';
    this.testStartingCard2 = 'None';

    // Optional: force previews to update
    // Angular will handle this automatically via ngModel
    console.log(`Set changed to: ${this.selectedSet}`);
  }


  getCardHighlightState(card: Card): CardHighlightState {

    if (!card.instanceId) {
      return { playable:false, attackable:false, activatable: false, targetable:false, selected:false };
    }

    let state = this.highlightCache.get(card.instanceId);
    if (state) return state;

    state = {
      playable: this.canPlayCard(
        this.game,
        card,
        card.isOpponent ? this.game.opponent : this.game.player
      ),
      attackable: this.canAttack(this.game, card),
      activatable: this.canActivate(this.game, card),
      targetable: card.laneIndex && card.laneIndex >= 0 ?
        this.isCardTargetable(this.game, card, card.laneIndex) :
        this.gameService.isCardInHand(this.game, card) ? 
          this.isHandTargetable(this.game, card) :
          this.isCardTargetable(this.game, card, card.laneIndex ?? 0),
      selected: this.selectedCard?.instanceId === card.instanceId
    };

    this.highlightCache.set(card.instanceId, state);
    return state;
  }

  forceUpdate() {
    if (this.updateAvailable) {
        this.swUpdate.activateUpdate().then(() => document.location.reload());
    } else {
        (window.location as any).reload(true);
    }
  }

  private getNextPendingAction(state: GameState): PendingAction | null {
    if (state.pendingActions.length === 0) return null;
    return state.pendingActions[0];  // peek first
  }

  private consumeNextPendingAction(state: GameState) {
    if (state.pendingActions.length > 0) {
      state.pendingActions.shift();  // remove first
      console.log(`Consumed pending action, ${state.pendingActions.length} remaining`);
    }
  }

  private processPendingQueue() {
    const action = this.getNextPendingAction(this.game);
    if (!action) {
      return;
    }

    this.invalidateHighlights();

    switch (action.type) {
      case 'attackAnim':
        if (action.sourceCard && action.target) this.attackWithCreature(this.game, action.sourceCard, action.target, true);        
        break;
      case 'creatureAnim':
        if (action.sourceCard && action.validLanes) this.playCreatureToLane(this.game, action.sourceCard, action.validLanes[0], true);
        break;
      case 'actionLaneAnim':
        if (action.sourceCard && action.validLanes) this.playActionToLane(this.game, action.sourceCard, action.validLanes[0], true);
        break;
      case 'actionTargetAnim':
        if (action.sourceCard && action.target) this.playActionToCard(this.game, action.sourceCard, action.target, true);
        break;
      case 'itemAnim':
        if (action.sourceCard && action.target && this.gameService.isCard(action.target)) {
          this.playItemToCard(this.game, action.sourceCard, action.target, true);
        } else {
          console.log('invalid target');
          this.game.waitingOnAnimation = false;
        }
        break;
      case 'supportAnim':
        if (action.sourceCard) this.playSupportToBar(this.game, action.sourceCard, true);
        break;

      case 'choice':
        if (action.sourceCard && action.effect) {
          this.showChoiceModal = true;
          this.currentChoiceOptions = action.options || [];
          this.currentChoiceSource = action.sourceCard;
          this.currentChoiceEffect = action.effect;
          this.selectedChoiceIndex = null;
          if (this.currentChoiceOptions.length === 1) {
            // Auto-select if only 1 option
            this.selectedChoiceIndex = 0;
            this.confirmChoice(this.game);
          } else if (action.prompt === 'random') {
            // Auto-randomize if prompt says so
            const randomIndex = Math.floor(Math.random() * this.currentChoiceOptions.length);
            this.selectedChoiceIndex = randomIndex;
            this.confirmChoice(this.game);
          } else if (action.effect.type === 'scry') {
            const deck = action.sourceCard.isOpponent 
              ? this.game.opponent.deck 
              : this.game.player.deck;
            const topCard = deck.length > 0 ? [deck[0]] : [];
            this.game.pendingActions.push({
              type: 'reveal',
              sourceCard: action.sourceCard,
              effect: action.effect,
              revealCards: topCard,
              prompt: `Next card`
            });
          }
        }
        break;

      case 'reveal':
      case 'revealAndChoose':
      case 'revealAndGuess':
        this.showRevealOverlay = true;
        this.revealCards = action.revealCards || [];
        this.revealTitle = action.prompt || 'Reveal';
        this.revealAction = action.type === 'revealAndChoose' ? 'Choose one' : '';
        this.revealIsOpponent = action.opponentTarget ?? false;

        if (action.type === 'revealAndChoose'
        ) {
          this.revealCallback = (selectedIndex?: number) => {
            if (selectedIndex === undefined) {
              this.showRevealOverlay = false;
              return;
            }

            this.handleRevealChoiceSelection(
              selectedIndex
            );

            this.showRevealOverlay = false;
          };
        } else if (action.type === 'revealAndGuess') {
          this.revealCallback = (selectedIndex?: number) => {
            if (selectedIndex === undefined) {
              this.showRevealOverlay = false;
              return;
            }

            this.handleGuessChoiceSelection(
              selectedIndex
            );

            this.showRevealOverlay = false;
          };
        } else {
          // Auto-hide simple reveal
          setTimeout(() => {
            this.showRevealOverlay = false;
          }, 3000);
        }
        break;

      case 'burn':
        if (action.sourceCard) this.showBurnHint(action.sourceCard, action.opponentTarget ?? false);
        break;

      case 'gameOver':
        if (this.gameOverHandled) break;
        this.gameOverHandled = true;
        this.gameOverVisible = true;
        this.gameOverMessage = action.prompt ?? '';
        this.game.stagedProphecy = null;  // just in case
        localStorage.removeItem('gameSave'); 
        const isVictory = action.prompt && (action.prompt.startsWith('You w') || action.prompt.startsWith('Bottom'));
        if (isVictory && this.isStoryMode) {
          if (this.isStoryMode) {
            //console.log('victory in story');
            //this.currentChapterIndex++;
            if (this.currentChapter?.endVideo && this.animationsEnabled) {
              //console.log('has end video');
              this.currentDialogue = this.currentChapter.endDialogue || '';
              this.playVideo(`/assets/tesl/story/forgotten_hero/video/${this.currentChapter.endVideo}.mp4`,'end');
            } else {
              //this.currentChapterIndex++;
              this.playMusic(this.getVictoryMusic());
              this.goToNextChapter();
            }
          }
        } else if (isVictory) {
          // Normal victory (not in story mode)
          this.playMusic(this.getVictoryMusic());
          if (this.isArenaMode) {
            this.loadArenaState();
            console.log('arena state is ', this.arenaState);
            this.arenaState.wins = (this.arenaState.wins ?? 0) + 1;
            if (this.arenaState.wins === 9) {
              this.arenaElo += 75;
              this.arenaElo = Math.min(2000,Math.max(800,this.arenaElo));
              console.log(`arena elo adjsuted to ${this.arenaElo}`);
              localStorage.setItem('TESL_arena_elo', this.arenaElo.toString());
            }
            if (this.arenaState.arenaOpponents) {
              for (let i = 0; i < 8; i++) {
                if (this.arenaState.arenaOpponents[i].name === this.selectedOpponentDeck?.name) {
                  this.arenaState.arenaOpponents[i].beaten = true;
                  console.log(`You have defeated ${this.selectedOpponentDeck?.name}`);
                }
              }
              if (this.arenaState.bossOpponent.name === this.selectedOpponentDeck?.name) {
                this.arenaState.bossOpponent.beaten = true;
                console.log(`You have defeated ${this.selectedOpponentDeck?.name}`);
              }
            }
            localStorage.setItem(this.ARENA_STATE_KEY, JSON.stringify(this.arenaState));
          } else if (this.isRankedMode) {
            localStorage.setItem('TESL_ranked_result', 'win');
          }
        } 
        else {
          // Defeat
          this.playMusic(this.getDefeatMusic());
          if (this.isArenaMode) {
            this.loadArenaState();            
            this.arenaState.losses = (this.arenaState.losses ?? 0) + 1;
            if (this.arenaState.losses === 3) {
              this.arenaElo += 25*(this.arenaState.wins-6);
              this.arenaElo = Math.min(2000,Math.max(800,this.arenaElo));
              console.log(`arena elo adjsuted to ${this.arenaElo}`);
              localStorage.setItem('TESL_arena_elo', this.arenaElo.toString());
            }
            localStorage.setItem(this.ARENA_STATE_KEY, JSON.stringify(this.arenaState));
            //localStorage.setItem('TESL_arena_losses',this.arenaLosses.toString());
          } else if (this.isRankedMode) {
            localStorage.setItem('TESL_ranked_result', 'lose');
          }
        }
        break;

      case 'prophecy':
        this.triggerProphecyFlash();
        break;

      case 'history':
        this.updateGroupedHistory();
        break;
      
      case 'audio':
        if (this.audioEnabled && action.sourceCard && action.prompt) {
          const url = this.audioService.getAudioForCard(action.sourceCard.id, action.prompt, action.sourceCard.set);
          if (url) {
            this.audioService.queueAudio(url);
          }
        }
        break;


      // ... other pending types ...
    }
    this.consumeNextPendingAction(this.game);
    if (this.game.pendingActions.length > 0) {
      this.processPendingQueue();
    }
  }

  private handleGuessChoiceSelection(selectedIndex: number) {
    const chosenCard = this.revealCards[selectedIndex];
    const owner = this.revealIsOpponent ? this.game.opponent : this.game.player;
    const enemy = this.revealIsOpponent ? this.game.player : this.game.opponent;
    const enemyHand = enemy.hand;
    const chosenEnemyHandIndex = enemyHand.indexOf(chosenCard);
    if (chosenEnemyHandIndex !== -1) {
      const cloneCard = this.deckService.cloneCardForGame(chosenCard, this.revealIsOpponent);
      if (owner.hand.length < 10) {
        this.game.lastCardDrawn = cloneCard;
        this.gameService.runEffects('DrawCard', owner, this.game);
        owner.hand.push(cloneCard);
        this.handVersion++;
        this.gameService.reapplyHandAuras(owner);
      }
    }
  }

  private handleRevealChoiceSelection(selectedIndex: number) {
    const chosenCard = this.revealCards[selectedIndex];
    // Remove chosen from deck, add to hand
    const targetPlayer = this.revealIsOpponent ? this.game.opponent : this.game.player;
    const deck2 = targetPlayer.deck;
    const chosenDeckIndex = deck2.indexOf(chosenCard);
    if (chosenDeckIndex !== -1) {
      deck2.splice(chosenDeckIndex, 1);
      if (this.revealTitle === 'Choose one to draw. Discard the others.') {
        console.log('need to discard the others');
        for (let i = 0; i < this.revealCards.length; i++) {
          if (i !== selectedIndex) {
            const otherCard = this.revealCards[i];
            const chosenDeckIndex2 = deck2.indexOf(otherCard);
            if (chosenDeckIndex2 !== 1) {
              deck2.splice(chosenDeckIndex2, 1);
              targetPlayer.discard.push(otherCard);
              console.log(`Discarded ${otherCard.name}`);
            }
          }
        }
      }
      if (targetPlayer.hand.length < 10) {
        this.game.lastCardDrawn = chosenCard;
        this.gameService.runEffects('DrawCard', targetPlayer, this.game);
        targetPlayer.hand.push(chosenCard);
        this.handVersion++;
        this.gameService.reapplyHandAuras(targetPlayer);
      } else {
        this.game.lastCardDrawn = null;
        console.log(`burned ${chosenCard.name} because hand is full`);
        this.showBurnHint(chosenCard, this.revealIsOpponent);
      }
    } else {
      //need to clone this card and add to hand
      const cloneCard = this.deckService.cloneCardForGame(chosenCard, this.revealIsOpponent);
      if (targetPlayer.hand.length < 10) {
        this.game.lastCardDrawn = cloneCard;
        this.gameService.runEffects('DrawCard', targetPlayer, this.game);
        targetPlayer.hand.push(cloneCard);
        this.handVersion++;
        this.gameService.reapplyHandAuras(targetPlayer);
      } else {
        this.game.lastCardDrawn = null;
        console.log(`burned ${cloneCard.name} because hand is full`);
        this.showBurnHint(cloneCard, this.revealIsOpponent);
      }
    }
    console.log(`Drew ${chosenCard.name} from Moment of Clarity reveal`);
    this.hideReveal();
  }

  ngDoCheck() {  // or use ngAfterViewChecked / a Subject
    const hasModalOpen = this.mulliganActive ||
    (this.isProphecyStaging && !this.isTargeting && !this.isSummonTargeting) ||
    this.showHistoryModal || this.enlargedCard ||
    this.showDiscardModal;  // add other modals here too if needed
      // e.g. this.enlargedCard || this.showHistoryModal || ...

    if (hasModalOpen && !this.bodyScrollLocked) {
      // Lock body scroll
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';  // prevents bounce on iOS
      this.bodyScrollLocked = true;
    } 
    else if (!hasModalOpen && this.bodyScrollLocked) {
      // Unlock
      document.body.style.overflow = '';
      document.body.style.height = '';
      this.bodyScrollLocked = false;
    }
    this.processPendingQueue();
  }

  getLaneIconImage(lanetype: string) {
    switch (lanetype) {
      case 'Field': 
        return `/assets/tesl/images/icons/LG-lane-${lanetype}.png`;
      case 'Shadow':
        return `/assets/tesl/images/icons/LG-lane-${lanetype}.png`;
      case 'Disabled':
        return `/assets/tesl/images/icons/LG-icon-Silence.png`;
      case 'Windy':
        return `/assets/tesl/images/icons/LG-lane-${lanetype}.png`;
      case 'Plunder':
        return `/assets/tesl/images/icons/LG-lane-${lanetype}.png`;
      default:
        return `/assets/tesl/images/icons/LG-lane-Field.png`;      
    }
  }

  get gameOverTitle(): string {
    let title = 'Game Over';
    if (this.gameOverMessage.includes('You win')) title = 'Victory';
    if (this.gameOverMessage.includes('You los')) title = 'Defeat';
    return title;
  }

  get cancelButtonActive(): boolean {
    return this.game.stagedCard !== null || this.game.stagedProphecy !== null ||
    this.game.stagedSummon !== null && this.game.stagedSupportActivation !== null;
  }

  get enlargedCardImage(): string {
    return this.utilityService.getCardImageByName(this.enlargedCard ? this.enlargedCard.name : 'placeholder'
      , this.setFolders[this.enlargedCard ? this.enlargedCard.set : '']);
  }

  get prophecyCardImage(): string {
    return this.utilityService.getCardImageByName(this.game.stagedProphecy ? this.game.stagedProphecy.name : 'placeholder'
      , this.setFolders[this.game.stagedProphecy ? this.game.stagedProphecy.set : '']
    );
  }

  get testStartingCard1Name(): string {
    return this.availableCards.find(
      c => c.id === this.testStartingCard1
    )?.name ?? 'None';
  }
  get testStartingCard2Name(): string {
    return this.availableCards.find(
      c => c.id === this.testStartingCard2
    )?.name ?? 'None';
  }

  getCardImageByName(name: string): string {
    const card = this.deckService.getCardByName(name);
    const set = card ? card.set : undefined;
    if (!set) return '';
    return this.utilityService.getCardImageByName(name, this.setFolders[set]);
  }

  getCardImage(card: Card): string {
    return this.utilityService.getCardImageByName(card ? card.name : 'placeholder', card ? this.setFolders[card.set] : undefined);
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    //console.log('KEY DOWN:', event.key, 'code:', event.code, 'target:', (event.target as any)?.tagName);

    // Skip if typing in input/select (don't steal focus)
    if (event.target instanceof HTMLInputElement || 
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.key === 'Escape') {
      // Close any non-settings modal first
      if (this.isHelpVisible) {
        this.isHelpVisible = false;
        return;
      }
      if (this.gameOverVisible) {
        this.gameOverVisible = false;
        if (this.isArenaMode) this.openSoloArena();
        if (this.isRankedMode) this.openRanked();
        return;
      }
      if (this.mulliganActive) {
        // Don't close mulligan with ESC — let Spacebar handle it
        return;
      }
      if (this.showMagickaOverlay) {
        this.showMagickaOverlay = false;
        return;
      }
      if (this.showDiscardModal) {
        this.showDiscardModal = false;
        return;
      }
      if (this.showHandModal) {
        this.showHandModal = false;
        return;
      }
      if (this.showHistoryModal) {
        this.showHistoryModal = false;
        return;
      }
      if (this.showPlayerSupportBar) {
        this.showPlayerSupportBar = false;
        return;
      }
      if (this.showOpponentSupportBar) {
        this.showOpponentSupportBar = false;
        return;
      }
      if (this.showChoiceModal) {
        this.cancelChoice();
        return;
      }
      if (this.enlargedCard) {
        this.closeModal();
      }

      // If no other modals → toggle settings
      if (this.showGameBoard) this.toggleSettingsOverlay();
      return;
    }

    // Only process if game is running (no menus/modals)
    if (this.showSettingsOverlay || this.isHelpVisible ||
      this.showMagickaOverlay || this.showDiscardModal ||
      this.showHistoryModal || this.showPlayerSupportBar || 
      this.showOpponentSupportBar || this.gameOverVisible || 
      this.showRevealOverlay
    ) {      
      if (this.showSettingsOverlay && (event.key === 'c' || event.key === 'C')) {
        this.concede();
      } else {
        console.log('Modal open - skipping game keys');
        return;
      }
    }

    if (!this.game.gameRunning) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.callStartGame();
      } else {
        return;
      }
    }

    // MULLIGAN MODE
    if (this.mulliganActive) {
      switch (event.key) {
        case '1':
        case '2':
        case '3':
          event.preventDefault();
          const index = parseInt(event.key) - 1;
          if (this.mulliganCards[index]) {
            this.mulliganToggle(this.mulliganCards[index]);
          }
          break;

        case ' ':
          event.preventDefault();
          this.completeMulligan(this.game);
          break;
      }
      return;
    }

    if (this.showChoiceModal) {
      if (event.key >= '1' && event.key <= '9') {
        const idx = parseInt(event.key) - 1;
        if (idx < this.currentChoiceOptions.length) {
          this.selectChoice(idx);
        }
      }
      if (event.key === ' ' && this.currentChoiceEffect !== null) {
        this.confirmChoice(this.game);
      }
      return;
    }

    if (!this.enlargedCard) {
      switch (event.key) {
        // End Turn
        case 'Enter':
          event.preventDefault();
          this.callEndTurn();
          this.processPendingQueue();
          break;

        // Hand selection (1-0)
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
        case '0':
          event.preventDefault();
          if (this.showOpponent) {
            const index = (this.game.opponent.hand.length-1)-
              (event.key === '0' ? 9 : (parseInt(event.key) - 1));
            if (this.game.opponent.hand[index]) {
              this.onCardSelect(this.game.opponent.hand[index]);
            }
          } else {
            const index = (this.game.player.hand.length-1)-
              (event.key === '0' ? 9 : (parseInt(event.key) - 1));
            if (this.game.player.hand[index]) {
              this.onCardSelect(this.game.player.hand[index]);
            }
          }
          break;

        case 'T':
        case 't':
          event.preventDefault();
          this.onPlayerTargetClick(this.game, this.game.opponent);
          break;

        case 'G':
        case 'g':
          event.preventDefault();
          this.onPlayerTargetClick(this.game, this.game.player);
          break;
        
        /*
        // Lane 0 (Shadow): Opponent [q,w,e,r] | Player [y,u,i,o]
        case 'q':
        case 'w':
        case 'e':
        case 'r':
          event.preventDefault();
          const oppLane0Index = 'qwer'.indexOf(event.key);
          if (oppLane0Index !== -1 && this.opponent.board[0][oppLane0Index]) {
            if (this.isTargeting || !this.isTargeting) {
              this.onBoardCardClick(this.opponent.board[0][oppLane0Index], 0);
            } else {
              this.onCardSelect(this.opponent.board[0][oppLane0Index]);
            }
          }
          break;

        case 'y':
        case 'u':
        case 'i':
        case 'o':
          event.preventDefault();
          const playerLane0Index = 'yuio'.indexOf(event.key);
          if (playerLane0Index !== -1 && this.player.board[0][playerLane0Index]) {            
            if (this.isTargeting || !this.isTargeting) {
              this.onBoardCardClick(this.player.board[0][playerLane0Index], 0);
            } else {
              this.onCardSelect(this.player.board[0][playerLane0Index]);
            }
          }
          break;

        // Lane 1 (Field): Opponent [a,s,d,f] | Player [h,j,k,l]
        case 'a':
        case 's':
        case 'd':
        case 'f':
          event.preventDefault();
          const oppLane1Index = 'asdf'.indexOf(event.key);
          if (oppLane1Index !== -1 && this.opponent.board[1][oppLane1Index]) {
            if (this.isTargeting || !this.isTargeting) {
              this.onBoardCardClick(this.opponent.board[1][oppLane0Index], 1);
            } else {
              this.onCardSelect(this.opponent.board[1][oppLane0Index]);
            }
          }
          break;

        case 'h':
        case 'j':
        case 'k':
        case 'l':
          event.preventDefault();
          const playerLane1Index = 'hJKL'.toLowerCase().indexOf(event.key.toLowerCase());
          if (playerLane1Index !== -1 && this.player.board[1][playerLane1Index]) {
            if (this.isTargeting || !this.isTargeting) {
              this.onBoardCardClick(this.player.board[1][playerLane0Index], 1);
            } else {
              this.onCardSelect(this.player.board[1][playerLane0Index]);
            }
          }
          break;*/
        
        case ',':
        case '.':
          event.preventDefault();
          const laneIndex = ',.'.toLowerCase().indexOf(event.key.toLowerCase());
          this.finalizePlay(this.game, laneIndex);
          break;

        // Settings (always works)
        case 'Escape':
          event.preventDefault();
          this.toggleSettingsOverlay();
          break;
      }
    }

    // SPACEBAR: Smart action (play/activate/attack if possible)
    const card = this.selectedCard ?? this.enlargedCard ?? null;
    if (card !== null && (event.key === ' ' || event.code === 'Space')) {
      if (this.canPlayCard(this.game, card, 
        this.game.player.turn? this.game.player : this.game.opponent)) {
        this.playCardFromModal(card);
      }
      if (this.canAttack(this.game,card)) {
        this.stageAttack(this.game,card);
      }
      if (this.canActivate(this.game,card)) {
        this.stageSupportActivation(this.game,card);
      }
      this.processPendingQueue();
    }
  }

  enlargeCard(card: Card) {
    this.enlargedCard = card;
  }

  closeModal() {
    this.enlargedCard = null;
  }

  callStartGame(overrides?: GameOverrides) {
    this.gameOverHandled = false;
    overrides = overrides ?? {};
    this.tempOverrides = overrides;
    this.showSettingsOverlay = false;
    this.showGameBoard = true;
    this.isMainMenu = false;
    
    if (!this.deckValid() || !this.selectedPlayerDeck) {
      this.selectedPlayerDeck = this.starterDecks[0];
      this.playerDeckMode = 'starter';
    }
    if (!this.selectedOpponentDeck) {
      this.selectedOpponentDeck = this.starterDecks[0];
      this.opponentDeckMode = 'starter';
    }
    const playerDeck = this.selectedPlayerDeck;
    const oppDeck = this.selectedOpponentDeck;
    let playerDeckCode = playerDeck.deckCode ?? ''; 
    let opponentDeckCode = oppDeck.deckCode ?? '';

    // If player chose Random → generate deck
    if (playerDeck.isRandom) {
      if (playerDeck.class === null) {
        console.warn('No class selected for random deck');
        return;
      }
      playerDeckCode = this.deckService.generateRandomDeckCode(playerDeck.attributes);
    }

    // Same for opponent
    if (oppDeck.isRandom) {
      if (oppDeck.class === null) {
        console.warn('No class selected for random opponent deck');
        return;
      }
      opponentDeckCode = this.deckService.generateRandomDeckCode(oppDeck.attributes);
    }
    if (!this.isExhibitionMode) {
      if (this.cheatsActive && !this.cheatEver) {
        this.cheatEver = true;
        localStorage.setItem('TESL_cheats_ever', 'true');
      }
      if (!this.cpuTogglePlaying) {
        this.cpuTogglePlaying = true;
        this.saveCPUtoggle();
      }
    }
    let magickaHandicap = this.oppHandicapMagicka;
    let cardHandicap = this.oppHandicapCards;
    if (this.isStoryMode) {      
      magickaHandicap = this.hardMode ? 2 : 0;
      cardHandicap = this.hardMode ? 2 : 0;
    } else if (this.isArenaMode) {
      magickaHandicap = 0;
      cardHandicap = 0;
    } else if (this.isRankedMode) {
      magickaHandicap = 0;
      cardHandicap = overrides?.oppCards ?? 0;
    }
    if (this.magickaBoost) {
      overrides.playerMaxMagicka = (overrides.playerMaxMagicka ?? 0) + 3;
    } else if (this.hasChicken) {
      if (overrides.playerBoard) {
        overrides.playerBoard[0].push('chicken');
        overrides.playerBoard[1].push('chicken');

      } else {
        overrides.playerBoard = [['chicken'],['chicken']];
      }
    }
    if (Object.keys(overrides).length > 0) console.log('Overrides: ',overrides);

    this.gameService.startGame(this.game, this.cpuTogglePlaying
          , opponentDeckCode
          , playerDeckCode
          , magickaHandicap, cardHandicap
          , this.animationsEnabled
          , this.classicTargeting
          , overrides);
    if (overrides.mulligan) {
      this.callEndTurn(); //end turn 0 to start game
      if (this.isStoryMode && this.currentChapterIndex <= 5) {
        this.playStoryHints(this.currentChapterIndex);
      }
    } else {      
      this.startMulligan(this.game);
    }
    this.updateGroupedHistory();
    this.updateBackgroundMusic();
  }

  

  callEndTurn() {
    const spinnerTimer2 = setTimeout(() => {
      this.cpuThinking = true;
    }, 50);
    this.cpuThinking = true;
    setTimeout(() => {
      this.gameService.endTurn(this.game);
      this.saveGameState(this.game);
      clearTimeout(spinnerTimer2);
      this.cpuThinking = false;
      this.processPendingQueue();
      this.updateGroupedHistory();
      this.invalidateHighlights();
    }, 25);    
  }

  private startMulligan(game: GameState) {
    console.log("startMulligan triggered");
    this.mulliganCards = game.player.hand.splice(0, 3);  // take first 3
    //this.mulliganCards = this.player.hand.splice(0, 3);  // take first 3
    console.log("Mulligan cards taken:", this.mulliganCards.map(c => c.name));
    this.mulliganToReturn.clear();
    this.mulliganActive = true;
    this.mulliganPhase = 'first';
    this.mulliganPlayer = game.player;
    //this.mulliganPlayer = this.player;
    console.log("mulliganActive set to true");
  }

  mulliganToggle(card: Card) {
    const id = card.instanceId!;
    if (this.mulliganToReturn.has(id)) {
      this.mulliganToReturn.delete(id);
    } else {
      this.mulliganToReturn.add(id);
    }
  }

  completeMulligan(game: GameState) {
    // Return selected cards to deck
    const toReturn = this.mulliganCards.filter(c => this.mulliganToReturn.has(c.instanceId!));
    if (this.mulliganPlayer) {
      this.mulliganPlayer.deck.push(...toReturn);
      this.mulliganPlayer.deck = this.utilityService.shuffle(this.mulliganPlayer.deck);

      // Draw replacements
      const needed = toReturn.length;
      this.gameService.drawCards(this.mulliganPlayer, needed, game);

      // Put remaining mulligan cards back into hand
      const kept = this.mulliganCards.filter(c => !this.mulliganToReturn.has(c.instanceId!));
      this.mulliganPlayer.hand.unshift(...kept);  // add to front or wherever you prefer
    }

    if (this.mulliganPhase === 'first' && !game.cpuPlaying) {
      this.mulliganCards = game.opponent.hand.splice(0, 3);  // take first 3
      console.log("Mulligan cards taken:", this.mulliganCards.map(c => c.name));
      this.mulliganToReturn.clear();
      this.mulliganActive = true;
      this.mulliganPhase = 'second';
      this.mulliganPlayer = game.opponent;
    } else {
      // Reset mulligan
      this.mulliganActive = false;
      this.mulliganCards = [];
      this.mulliganToReturn.clear();

      // Opponent auto-mulligan (simple: any card >3 magicka)
      if (game.cpuPlaying) this.autoMulligan('opponent', game);

      if (this.showTestInputs && this.isExhibitionMode) {
        game.player.maxMagicka = Math.max(0, Math.min(9, this.testStartingMaxMagicka));
        game.opponent.maxMagicka = Math.max(0, Math.min(9, this.testStartingMaxMagicka));
        if (this.testStartingCard1 !== 'None') {
          const card1 = this.deckService.getCardById(this.testStartingCard1);
          if (card1) {
            const cloneP1 = this.deckService.cloneCardForGame(card1, false);
            game.player.hand.push(cloneP1);
            this.gameService.executeEffectsForCard('AddToHand',cloneP1,game.player, game);
            const cloneO1 = this.deckService.cloneCardForGame(card1, true);
            game.opponent.hand.push(cloneO1);
            this.gameService.executeEffectsForCard('AddToHand',cloneO1,game.opponent, game);
          }
        }

        if (this.testStartingCard2 !== 'None' /*&& this.testStartingCard2 !== this.testStartingCard1*/) {
          const card2 = this.deckService.getCardById(this.testStartingCard2);
          if (card2) {
            const cloneP2 = this.deckService.cloneCardForGame(card2, false);
            game.player.hand.push(cloneP2);
            this.gameService.executeEffectsForCard('AddToHand',cloneP2,game.player, game);
            const cloneO2 = this.deckService.cloneCardForGame(card2, true);
            game.opponent.hand.push(cloneO2);
            this.gameService.executeEffectsForCard('AddToHand',cloneO2,game.opponent, game);
          }
        }
      } else if (this.tempOverrides?.playerHand) {
        console.log(`player hand override: ${this.tempOverrides.playerHand[0]}`)
        this.tempOverrides.playerHand.forEach(c => {
          const card0 = this.deckService.getCardById(c);
          if (card0) {
            const clone0 = this.deckService.cloneCardForGame(card0,false);
            game.player.hand.push(clone0);
            this.gameService.executeEffectsForCard('AddToHand',clone0,game.player, game);
          }
        });
      }
      //start 1st player turn by ending turn 0
      if (this.isStoryMode && this.currentChapterIndex <= 5) {
        this.playStoryHints(this.currentChapterIndex);
      }
      this.callEndTurn();
    }
  }

  private autoMulligan(reqPlayer: 'player' | 'opponent', game: GameState) {
    const refPlayer = reqPlayer === 'player' ? game.player : game.opponent;
    //const refPlayer = reqPlayer === 'player' ? this.player : this.opponent;
    const highCost = refPlayer.hand.filter(c => c.cost > 3);
    if (highCost.length === 0) return;
    console.log (reqPlayer, ' replacing ', highCost.length, ' cards.')
    // Return them
    refPlayer.deck.push(...highCost);
    refPlayer.deck = this.utilityService.shuffle(refPlayer.deck);

    // Keep the rest
    refPlayer.hand = refPlayer.hand.filter(c => c.cost <= 3);

    // Draw replacements
    this.gameService.drawCards(refPlayer, highCost.length, game);

  }  

  get showOpponent(): boolean {
    if (this.game.cpuPlaying || !this.game.gameRunning) {
      return false;
    } else if (this.game.player.turn) {
      if (this.game.stagedProphecy) {
        return true;
      } else {
        return false;
      }
    } else {
      if (this.game.stagedProphecy) {
        return false;
      } else {
        return true;
      }
    }
  }  

  hasRingOfMagicka(game: GameState, reqPlayer: 'player' | 'opponent') {
    const refPlayer = reqPlayer === 'player' ? game.player : game.opponent;
    return refPlayer.support.some(c => c.id === 'ring-of-magicka');
  }  

  selectChoice(index: number) {
    this.selectedChoiceIndex = index;
    console.log(`Choice selected: ${this.currentChoiceOptions[index].text}`);
  }

  confirmChoice(game: GameState) {
    if (this.selectedChoiceIndex === null) return;

    const chosen = this.currentChoiceOptions[this.selectedChoiceIndex];
    const nestedEffect = chosen.effect;
    game.targetLaneRequired = false;
    const secondaryCard = this.deckService.getCardByName(chosen.text);
    if (secondaryCard) {
      game.pendingActions.push({
        type: 'reveal',
        sourceCard: game.stagedCard ?? undefined,
        effect: nestedEffect,
        revealCards: [secondaryCard],
        prompt: `Revealed card`
      });
    }
    // Check if nested effect needs manual target
    game.waitingOnScry = false;
    if (nestedEffect?.target?.includes('hisLane')) game.targetLaneRequired = true;
    if (!this.gameService.isAutoTarget(nestedEffect.target) ||
      game.targetLaneRequired) {
      // Stage it for targeting
      game.stagedCard = this.currentChoiceSource;
      game.stagedAction = 'choice-followup';
      this.choiceFollowupEffect = nestedEffect;  // temp storage
      this.showChoiceModal = false;
      //this.cancelButtonActive = true;
      console.log('Choice made — now select target');
      if (nestedEffect.target === 'supportEnemy') {
        if (this.showOpponent) {
          this.showPlayerSupportBar = true;
        } else {
          this.showOpponentSupportBar = true;
        }
      }
    } else {
      // Auto-apply immediately
      if (this.currentChoiceSource) this.gameService.executeEffect(nestedEffect, this.currentChoiceSource, game);
      this.closeChoiceModal();
    }
    this.invalidateHighlights();
    //this.processPendingQueue();
  }

  cancelChoice() {
    this.game.waitingOnScry = false;
    this.closeChoiceModal();
  }

  closeChoiceModal() {
    this.showChoiceModal = false;
    this.currentChoiceEffect = null;
    this.currentChoiceSource = null;
    this.currentChoiceOptions = [];
    this.selectedChoiceIndex = null;
  }

  // Show reveal overlay
  private showReveal(revealTitle: string, cards: Card[], actionText: string = '', isOpponent = false) {
    this.revealCards = cards;
    this.revealTitle = revealTitle;
    this.revealAction = actionText;
    this.revealIsOpponent = isOpponent;
    this.showRevealOverlay = true;
    this.revealCallback = null;

    // Auto-hide after 3 seconds if no choice needed
    if (!actionText) {
      this.revealTimeout = setTimeout(() => {
        this.hideReveal();
      }, 3000);
    }
  }

  // Show reveal WITH choice (player must pick one)
  /*private showRevealChoice(revealTitle: string, cards: Card[], callback: (selectedIndex: number) => void, isOpponent = false) {
    this.revealCards = cards;
    this.revealTitle = revealTitle;
    this.revealAction = 'Choose one to draw';
    this.revealIsOpponent = isOpponent;
    this.showRevealOverlay = true;
    this.revealCallback = callback;
  }*/

  // Hide reveal (auto or manual)
  hideReveal() {
    this.showRevealOverlay = false;
    this.revealCards = [];
    this.revealTitle = '';
    this.revealAction = '';
    this.revealCallback = null;
    if (this.revealTimeout) {
      clearTimeout(this.revealTimeout);
      this.revealTimeout = null;
    }
  }

  // When player clicks a valid target during summon targeting
  onSummonTargetClick(game: GameState, target: Card | PlayerState) {
    if (!this.isSummonTargeting || game.stagedSummon === null) return;
    //console.log('summon targeting');
    if (this.isValidSummonTarget(game, target, game.stagedSummon.laneIndex!)) {   // laneIndex not really used here
      //console.log('valid effect');
      let summonAnimation = false;
      let animationIcon = '';
      const refCard = game.stagedSummon;
      //console.log(`ref card is ${refCard.name}`);
      if (this.animationsEnabled && !this.isProphecyStaging) {
        refCard.effects?.forEach(effect => {
          if (effect.trigger === 'Summon') {
            switch (effect.type) {
              case 'shackle':
              case 'freeze':
                animationIcon = 'shackle';
                summonAnimation = true;
                break;
              case 'silence':
                animationIcon = 'silence';
                summonAnimation = true;
                break;
              case 'destroy':
                animationIcon = 'fire';
                summonAnimation = true;
                break;
              case 'damage':
                if ((effect.amount ?? 0) > 0) {
                  animationIcon = 'fire';
                  summonAnimation = true;
                } else if ((effect.amount ?? 0) < 0) {
                  animationIcon = 'plus';
                  summonAnimation = true;
                }
                break;
              case 'buffTarget': {
                const modAttack = effect.modAttack ?? 0;
                const modHealth = effect.modHealth ?? 0;
                if (modAttack !== 0) {
                  if (modAttack > 0) {
                    animationIcon = 'plus';
                    summonAnimation = true;
                  } else if (modAttack < 0) {
                    animationIcon = 'minus';
                    summonAnimation = true;
                  }
                } else if (modHealth !== 0) {
                  if (modHealth > 0) {
                    animationIcon = 'plus';
                    summonAnimation = true;
                  } else if (modHealth < 0) {
                    animationIcon = 'minus';
                    summonAnimation = true;
                  }
                } else if (effect.addKeywords) {
                    animationIcon = 'plus';
                    summonAnimation = true;
                } else if (effect.removeKeywords) {
                    animationIcon = 'minus';
                    summonAnimation = true;
                }
                break;
              }
              case 'doubleAttack':
              case 'doubleHealth':
              case 'doubleStats':
                animationIcon = 'plus';
                summonAnimation = true;
                break;
              default:                
            }
          }
        });
      }
      if (summonAnimation) {
        this.targetWithSummon(game, refCard, target, animationIcon);
      } else {
        refCard.effects?.forEach(effect => {
          if (effect.trigger === 'Summon') {
            this.gameService.executeEffect(effect, refCard, game, target);
          }
        });
      }
    } else {
      console.log('invalid summon target');
    }
    this.invalidateHighlights();
    //this.handlePendingAction(this.game.pendingAction);
    this.updateGroupedHistory();
  }

  toggleMagickaOverlay() {
    this.showMagickaOverlay = !this.showMagickaOverlay;
  }

  toggleOpponentSupportBar() {
    this.showOpponentSupportBar = !this.showOpponentSupportBar;
    this.showPlayerSupportBar = false; // close the other if open
  }

  togglePlayerSupportBar() {
    this.showPlayerSupportBar = !this.showPlayerSupportBar;
    this.showOpponentSupportBar = false;
  }

  trackById(index: number, card: any): string {
    return card.id; // or card.name if no unique id
  }

  trackByIndex(index: number): number {
    return index; // for lanes
  }

  get isLaneRequired(): boolean {
    return this.game.targetLaneRequired;
  }

  get isSummonTargeting(): boolean {
    return this.game.stagedSummon !== null;
  }

  get opponentRuneCount(): number {
    return this.game.opponent?.runes?.filter(r => !!r).length || 0;
  }

  get opponentHandCount(): number {
    return this.game.opponent?.hand?.length || 0;
  }

  get opponentDeckSize(): number {
    return this.game.opponent?.deck?.length || 0;
  }

  get opponentSupportCount(): number {
    return this.game.opponent?.support?.length || 0;
  }

  get playerRuneCount(): number {
    return this.game.player?.runes?.filter(r => !!r).length || 0;
  }

  get playerHandCount(): number {
    return this.game.player?.hand?.length || 0;
  }

  get playerDeckSize(): number {
    return this.game.player?.deck?.length || 0;
  }

  get playerSupportCount(): number {
    return this.game.player?.support?.length || 0;
  }

  canPlayCard(game: GameState, card: Card, player: PlayerState): boolean {
    if (!player.turn || !game.gameRunning) return false;
    if (game.stagedSummon || game.stagedCard || game.stagedProphecy || game.stagedSupportActivation ||
      game.stagedAttack || game.stagedAction !== 'none') {
        return false;
    }
    if (player.currentMagicka < (card.currentCost ?? card.cost)) return false;
    if (card.playCondition && 
      !this.gameService.isPlayConditionMet(card.playCondition,player)) return false;
    // Only allow playing from hand or support (for now)
    return player.hand.includes(card);
  }

  onEndTurn(game: GameState) {
    if (game.waitingOnAnimation) return;
    this.invalidateHighlights();
    game.targetLaneRequired = false;
    if (this.isSummonTargeting) {
      // Player chose to skip targeting
      if (game.stagedSummon?.targetReq || game.classicTargeting) {
        let msg = 'Target required for this effect.';
        if (game.classicTargeting) msg = 'Targeting cannot be skipped in classic mode.';
        this.showTemporaryHint(msg);
        console.log(`Summon targeting CANNOT be skipped for ${game.stagedSummon?.name}`);
        return;
      } else {
        console.log(`Summon targeting skipped for ${game.stagedSummon?.name}`);
        this.clearSummonTargeting(game);
        return;
      }
    }
    if (this.cancelButtonActive) {
      if (this.game.stagedAction === 'choice-followup' && this.game.stagedCard?.targetReq) {
        console.log(`Targeting CANNOT be skipped for ${game.stagedCard?.name}`);
        return;
      }
      this.clearStaging(this.game);
      return;
    }
    if (this.isAttackStaging) {
      this.cancelAttack(this.game);
      return;
    }
    if (game.gameRunning) {

      this.callEndTurn();
    } else {
      this.callStartGame();
      //console.log(`# creatures on board is ${this.getAllCreatures(this.game).length}`);
      //this.game = { ...this.game };  // shallow copy trick to trigger change detection
    }
  }

  private clearSummonTargeting(game: GameState) {
    game.stagedSummon = null;
    game.stagedSummonEffect = null;
    this.showOpponentSupportBar = false;
    //this.cancelButtonActive = false;
    this.clearHint();
    if (this.isProphecyStaging) {
      console.log("Clearing staged prophecy after play");
      game.stagedProphecy = null;
      //resume opponent turn
      this.gameService.breakRunesIfNeeded(game, game.player);
      if (!game.stagedProphecy && !game.player.turn && game.cpuPlaying) {
        this.resumeOpponentTurn(game);
      }
    }
  }

  isValidTarget(game: GameState, card: Card | PlayerState, laneIndex: number): boolean {    
    //console.log('staged card: ',game.stagedCard);
    if (game.stagedCard) {
      //console.log('staged action: ',game.stagedAction);
      //console.log('staged effect: ',this.choiceFollowupEffect);
      if (game.stagedAction === 'play-item') {
        return this.gameService.isCard(card) && card.type === 'Creature' && card.isOpponent === this.showOpponent;
      } else if (game.stagedAction === 'play-creature' && 
          this.isLaneFull(game, laneIndex)) {
        return this.gameService.isCard(card) && card.type === 'Creature' && card.isOpponent === this.showOpponent;
      } else if (game.stagedAction === 'play-action' && game.stagedCard) {
        // Check based on the Play effects of the staged action card
        const playEffects = game.stagedCard.effects?.filter(
            e => e.trigger === 'Play') || [];

        // If no Play effects → assume auto / no target needed
        if (playEffects.length === 0) {
          return false; // or true if you want to allow clicking anywhere
        }

        // We need the target to be valid for **at least one** Play effect that requires selection
        for (const effect of playEffects) {
          // Skip auto-target effects (they don't need player input)
          if (this.gameService.isAutoTarget(effect.target)) {
            continue;
          }

          // Check if this target matches what the effect wants
          if (this.gameService.isTargetValidForEffect(game, game.stagedCard, effect, card, laneIndex)) {
            return true;
          }
        }

        return false;
      } else if (game.stagedAction === 'choice-followup' && this.choiceFollowupEffect) {
        //console.log('checking targeting for choice followup');
        if (!game.classicTargeting && this.gameService.isCard(card) && 
          card.instanceId === game.stagedCard?.instanceId && 
          !game.stagedCard.targetReq) return false; // cannot target self
        return this.gameService.isTargetValidForEffect(game, game.stagedCard!, 
          this.choiceFollowupEffect, card, laneIndex);
      }
    }
    if (this.isAttackStaging && game.stagedAttack) {
      const player = game.stagedAttack.isOpponent ? game.player : game.opponent;
      const owner = game.stagedAttack.isOpponent ? game.opponent : game.player;
      const attackAll = game.stagedAttack.immunity?.includes('AttackRestrictions');
      if (attackAll) {
        //ignores lanes and guards
        if (this.gameService.isCard(card)) {
          if (card.covered) return false;
          if (card.isOpponent === game.stagedAttack.isOpponent) return false;
          return true;
        } else {
          return card === player;
        }
      }
      const lane = game.stagedAttack.laneIndex ?? 0;
      const ownerOtherLane = owner.board[1-lane];
      const enemyLane = player.board[lane];
      const enemyOtherLane = player.board[1-lane];
      const laneHasGuard = enemyLane.some(c =>
        c.currentKeywords?.includes('Guard')
      );
      const otherLaneHasGuard = enemyOtherLane.some(c =>
        c.currentKeywords?.includes('Guard')
      );
      const laneHasSuperGuard = enemyLane.some(c =>
        c.currentKeywords?.includes('Guard') && c.immunity?.includes('DefenseRestrictions')
      );
      const otherLaneHasSuperGuard = enemyOtherLane.some(c =>
        c.currentKeywords?.includes('Guard') && c.immunity?.includes('DefenseRestrictions')
      );
      const canMoveToAttack = game.stagedAttack.immunity?.includes('LaneRestrictions') &&
        ownerOtherLane.length < 4; // can only move if other lane has space
      // Creature target
      if (this.gameService.isCard(card)) {
        if (card.covered) {
          return false;
        }
        if (!enemyLane.includes(card)) {
          if (canMoveToAttack && enemyOtherLane.includes(card)) {
            if (otherLaneHasGuard || laneHasSuperGuard) {
              return card.currentKeywords?.includes('Guard') ?? false;
            } else {
              return true;
            }
          } else if (otherLaneHasSuperGuard && card.immunity?.includes('DefenseRestrictions')) {
            return true;
          } else if (game.stagedAttack.immunity?.includes('Loyalty')) {
            if (owner.board[lane].includes(card) && card !== game.stagedAttack) {
              return true;
            } else {
              return false;
            }
          } else {
            return false;
          }
        }
        if (laneHasGuard || otherLaneHasSuperGuard) {
          return card.currentKeywords?.includes('Guard') ?? false;
        }
        return true;
      }
      // Player target
      return (!laneHasGuard && !otherLaneHasSuperGuard) && card === player;
    }
    if (game.stagedSupportActivation !== null) {
      const actEffects = game.stagedSupportActivation.effects?.filter(
          e => e.trigger === 'Activation') || [];

      // If no Play effects → assume auto / no target needed
      if (actEffects.length === 0) {
        return false; // or true if you want to allow clicking anywhere
      }

      // We need the target to be valid for **at least one** Play effect that requires selection
      for (const effect of actEffects) {
        // Skip auto-target effects (they don't need player input)
        if (this.gameService.isAutoTarget(effect.target)) {
          continue;
        }

        // Check if this target matches what the effect wants
        if (this.gameService.isTargetValidForEffect(game,game.stagedSupportActivation, effect, card, laneIndex)) {
          return true;
        }
      }

      return false;
    }
    return false;
  }

  isValidSummonTarget(game: GameState, target: Card | PlayerState, laneIndex: number): boolean {
      if (!game.stagedSummonEffect || !game.stagedSummon) return false;
      if (!game.classicTargeting && this.gameService.isCard(target) && target.instanceId === game.stagedSummon?.instanceId) {
        if (target.targetReq) {
          return true; // allow target self if target req
        } else {
          return false; // cannot target self
        }
      } 
      const result = this.gameService.isTargetValidForEffect(game, game.stagedSummon, game.stagedSummonEffect, target, laneIndex);
      //console.log(`target valid for summon target? : ${result}`);
      return result;
  }

  // NEW: Separate target vs enlarge clicks
  onLaneClick(game: GameState, laneIndex: number) {
    if (!this.isTargeting || game.stagedAction !== 'play-creature') return;
    
    if (!this.isLaneFull(game, laneIndex)) {
      // Empty lane - play directly
      this.finalizePlay(game, laneIndex);
    }
    // Full lane - do nothing (sacrifice handled by creature clicks)
  }

  onCreatureTarget(game: GameState, card: Card, laneIndex: number, position: number) {
    if (!this.isTargeting) return;
    
    if (game.stagedAction === 'play-item') {
      // Item targeting
      this.finalizePlay(game,undefined, card);
    } else if (game.stagedAction === 'play-creature' && this.isLaneFull(game,laneIndex)) {
      // Sacrifice for space
      this.sacrificeCreature(game,card, laneIndex, position);
    }
  }

  sacrificeCreature(game: GameState, card: Card, laneIndex: number, position: number) {
    // Remove creature (destroy effect)
    const player = this.showOpponent ? game.opponent : game.player;
    const sacCreature = player.board[laneIndex][position];
    this.gameService.destroyCard(game, sacCreature);
    //this.player.board[laneIndex].splice(position, 1);
    
    // Play the staged creature in its place
    this.finalizePlay(game, laneIndex);
    
    console.log(`Sacrificed ${card.name} to make room`);
  }

  playCardFromModal(card: Card) {
    this.stageCardForPlay(this.game, card, this.showOpponent ? this.game.opponent : this.game.player);
    //this.handlePendingAction(this.game.pendingAction);
    this.updateGroupedHistory();
  }

  get isTargeting(): boolean {
    return this.game.stagedCard !== null || this.isAttackStaging || this.game.stagedSupportActivation !== null;
  }

  get showLaneHighlights(): boolean {
    return this.game.stagedAction === 'play-creature';
  }

  get showCreatureHighlights(): boolean {
    return this.game.stagedAction === 'choice-followup' || this.game.stagedAction === 'play-action' || this.game.stagedAction === 'play-item' || 
           (this.game.stagedAction === 'play-creature' && this.isLaneFull(this.game,0) && !this.isLaneFull(this.game,1));
  }

  // Check if lane has 4 creatures (TESL limit)
  isLaneFull(game: GameState, laneIndex: number): boolean {
    if (this.showOpponent) {
      if (game.opponent.board[laneIndex].length >= 4) {
        return true;
      } else if (game.player.board[1-laneIndex].some(c => c.immunity?.includes('CreaturesInOtherLane'))) {
        return true;
      } else {
        return false;
      }
    } else {
      if (game.player.board[laneIndex].length >= 4) {
        return true;
      } else if (game.opponent.board[1-laneIndex].some(c => c.immunity?.includes('CreaturesInOtherLane'))) {
        return true;
      } else {
        return false;
      }
    }
    
  }

  // Get valid lanes for creature placement
  getValidLanes(game: GameState): number[] {
    return game.stagedAction === 'play-creature' ? 
      [0, 1].filter(lane => !this.isLaneFull(game, lane)) : [];
  }  

  // Stage card for playing (called from modal)
  stageCardForPlay(game: GameState, card: Card, player: PlayerState) {
    this.invalidateHighlights();
    this.closeHandModal();
    const isProphecy = this.isProphecyStaging && game.stagedProphecy === card;
    
    if (!isProphecy) {
      // Normal play checks
      if (!player.turn || player.currentMagicka < (card.currentCost ?? card.cost)) {
        console.log("Cannot stage normal card: not your turn or insufficient magicka");
        return;
      }
    } else {
      console.log("Prophecy play — bypassing turn & magicka checks");
    }
    game.stagedCard = card;
    console.log(`Staging card for play: ${card.name}`);
    //this.cancelButtonActive = true;
    let url: string | null;
    const refType = this.deckService.getEffectiveType(card);
    switch (refType) {
      case 'Creature':
        game.stagedAction = 'play-creature';
        console.log('Staged action: play-creature');
        break;
      case 'Item':
        game.stagedAction = 'play-item';
        break;
      case 'Support':
        if (this.audioEnabled) {
          url =this.audioService.getAudioForCard(card.id, 'stage', card.set);
          if (url) {
            this.audioService.queueAudio(url);
          }
        }
        if (this.animationsEnabled && !this.isProphecyStaging) {
          this.playSupportToBar(game, card, false);
        } else {
          this.gameService.playCard(game,card,card.isOpponent,undefined,undefined,this.isProphecyStaging); // Supports don't need targeting
          this.clearStaging(game);
        }
        break;
      case 'Action':
        if (this.audioEnabled) {
          url =this.audioService.getAudioForCard(card.id, 'stage', card.set);
          if (url) {
            this.audioService.queueAudio(url);
          }
        }
        // Look at the effects instead of card.target
        const playEffects = card.effects?.filter(e => e.trigger === 'Play') || [];

        // If there are no Play effects → just play immediately (unlikely but safe)
        if (playEffects.length === 0) {
          this.gameService.playCard(game,card,card.isOpponent,undefined,undefined,this.isProphecyStaging);
          this.clearStaging(game);
          break;
        }

        // Check if **all** Play effects are auto-targetable
        const creatureTargetRequired = playEffects.some(effect => effect.target?.includes('creature') &&
          !effect.target.includes('All') && !effect.target.includes('Random'));
        game.targetLaneRequired = playEffects.some(effect => effect.target === 'lane' || 
          (effect.target?.includes('hisLane') && !creatureTargetRequired));

        const allAuto = playEffects.every(effect => this.gameService.isAutoTarget(effect.target));
        const thisLane = playEffects.some(effect => effect.target?.includes('hisLane'));
        if (allAuto && !thisLane) {
          // Everything can be resolved automatically → play now
          this.gameService.playCard(game,card,card.isOpponent,undefined,undefined,this.isProphecyStaging);
          this.clearStaging(game);
        } else {
          // At least one effect needs player selection → stage and wait for target
          game.stagedAction = 'play-action';
          if (this.showHelpHints) this.showTemporaryHint(card.text);      
          // Optional: highlight valid targets based on the effect(s) that need selection
        }
        break;
    }

    if (this.showHelpHints && game.stagedCard) {
      if (game.stagedCard.type === 'Action') {
        this.showTemporaryHint(game.stagedCard.text || 'Play this action');
      } else if (game.stagedCard.type === 'Item') {
        this.showTemporaryHint('Target friendly creature');
      }
      // Summon staging handled separately below
    }

    this.closeModal(); // Close enlarged view
    //this.handlePendingAction(this.game.pendingAction);
    this.updateGroupedHistory();
  }

  handleSummonStageInfo(game: GameState) {
    if (game.stagedSummon) {
      if (this.showHelpHints) this.showTemporaryHint(this.getSummonText(game.stagedSummon));      
      if (game.stagedSummon.effects?.some(effect => effect.target === 'supportEnemy' && effect.trigger === 'Summon')) {
        if (this.showOpponent) {
          this.showPlayerSupportBar = true;
        } else {
          this.showOpponentSupportBar = true;
        }
      }
    }
    

  }

  // Finalize play after target selection
  finalizePlay(game: GameState, targetLane?: number, targetCreature?: Card | PlayerState) {
    if (targetLane && game.laneTypes[targetLane] === 'Disabled') return false;
    this.invalidateHighlights();
    if (!game.stagedCard) return;

    const prophPlay = this.isProphecyStaging;
    if (game.stagedAction === 'play-creature') {
      const lane = targetLane ?? 0; // Default to lane 0 if not specified
      if (this.isLaneFull(game,lane)) {
        console.warn('Cannot play creature: lane full');
        return;
      }
      /*if (this.audioEnabled) {
        const url = this.audioService.getAudioForCard(game.stagedCard.id, 'enter', game.stagedCard.set);
        if (url) {
          this.audioService.queueAudio(url);
        }
      }*/
      if (this.animationsEnabled && !this.isProphecyStaging) {
        this.playCreatureToLane(game,game.stagedCard, lane, false);
      } else {
        this.gameService.playCard(game,game.stagedCard, game.stagedCard.isOpponent, lane, undefined, this.isProphecyStaging);
        this.handleSummonStageInfo(game);
      }
    } else if (game.stagedAction === 'play-item') {
      if (!targetCreature) return;
      if (this.gameService.isCard(targetCreature) && targetCreature.type === 'Creature') {
        if (this.animationsEnabled && !this.isProphecyStaging) {
          this.playItemToCard(game,game.stagedCard, targetCreature, false);
        } else {
          this.gameService.playCard(game,game.stagedCard, game.stagedCard.isOpponent, undefined, targetCreature, this.isProphecyStaging);
          this.handleSummonStageInfo(game);
        }
      } else {
        return;
      }
    } else if (game.stagedAction === 'play-action') {
      // Step 1: Check if any Play effect requires a lane target
      const playEffects = game.stagedCard.effects?.filter(e => e.trigger === 'Play') || [];
      const requiresLane = playEffects.some(effect => effect.target === 'lane' || effect.target?.includes('hisLane'));
      if (targetLane) game.stagedCard.laneIndex = targetLane;
      if (requiresLane) {
        console.log(game.stagedCard.name, ' requires a lane; target is: ', targetLane);
        // Must have a valid lane selected
        if (targetLane === undefined || targetLane < 0 || targetLane > 1) {
          console.warn('Action requires a lane target but none provided');
          return;
        }
        // Pass the lane to playCard
        if (this.animationsEnabled && !this.isProphecyStaging) {
          this.playActionToLane(game, game.stagedCard, targetLane, false);
        } else {
          this.gameService.playCard(game,game.stagedCard, game.stagedCard.isOpponent, targetLane, undefined, this.isProphecyStaging);
        }
      } 
      else {
        console.log(game.stagedCard.name, ' does not require a lane');
        // No lane required → check if ALL Play effects are auto-targetable
        const allAuto = playEffects.every(effect => this.gameService.isAutoTarget(effect.target));

        if (allAuto) {
          // Safe to play immediately with no specific target
          this.gameService.playCard(game,game.stagedCard, false, undefined, targetCreature, this.isProphecyStaging);
        } 
        else {
          // Not all effects are auto → we needed a target but didn't get one
          if (!targetCreature) {
            console.warn('Action requires a target but none was selected');
            return;
          }
          // Otherwise play with the provided target (creature or lane)
          if (this.animationsEnabled && !this.isProphecyStaging) {
            this.playActionToCard(game, game.stagedCard, targetCreature, false);
          } else {
            this.gameService.playCard(game,game.stagedCard, game.stagedCard.isOpponent, targetLane, targetCreature, this.isProphecyStaging);
          }
        }
      }
    } else if (game.stagedAction === 'choice-followup' && 
       this.choiceFollowupEffect && game.targetLaneRequired && targetLane !== undefined) {
        this.gameService.executeEffect(this.choiceFollowupEffect, game.stagedCard!, game, undefined, targetLane);
        this.clearStaging(game);
    } else if (game.stagedAction === 'choice-followup' && this.choiceFollowupEffect && targetCreature ) {
      this.gameService.executeEffect(this.choiceFollowupEffect, game.stagedCard!, game, targetCreature, undefined);
        this.clearStaging(game);
    } else {
      return;
    }
    if (!this.animationsEnabled || prophPlay ||
      (game.stagedAction !== 'play-creature' && game.stagedAction !== 'play-item')) {
      this.clearStaging(this.game);
      //this.handlePendingAction(this.game.pendingAction);
      this.updateGroupedHistory();
    }
  }

  // Clear staging (Cancel button)
  clearStaging(game: GameState) {
    game.stagedCard = null;
    game.stagedAction = 'none';
    game.targetLaneRequired = false;
    //game.stagedSummon = null;
    //game.stagedProphecy = null;
    //this.cancelButtonActive = false;
    this.selectedCard = null;
    if (!game.stagedSummon) this.clearHint();
    game.stagedSupportActivation = null;
  }

  onSupportBarClick(game: GameState, card: Card) {
   this.onBoardCardClick(game, card, 0);
  }

  onHandClick(game: GameState, card: Card) {
    this.onBoardCardClick(game,card, 0);
  }

  onBoardCardClick(game: GameState, card: Card, laneIndex: number) {
    if (game.waitingOnAnimation) return;
    this.invalidateHighlights();
    const player = this.showOpponent ? this.game.opponent : this.game.player;
    //console.log('summon targeting is: ',this.isSummonTargeting);
    if (this.isSummonTargeting) {
      this.onSummonTargetClick(game,card);
      return;
    }
    if (!this.isTargeting) { //} || (card.type !== 'Creature' && card.type !== 'Support')) {
      console.log('Not targeting');
      return;
    }
    if (game.stagedCard) {
      if (game.stagedAction === 'play-item') {
        if (card.isOpponent && !this.showOpponent) return; // Can't target opponent's creatures with items
        if (!card.isOpponent && this.showOpponent) return; // Can't target opponent's creatures with items
        this.finalizePlay(game, undefined, card);
      } else if (game.stagedAction === 'play-creature' && this.isLaneFull(game, laneIndex)) {
        console.log('Sacrifice', card.name, 'for space');
        const position = player.board[laneIndex].indexOf(card);
        if (position !== -1) {
          this.sacrificeCreature(this.game, card, laneIndex, position);
        }
      } else if (game.stagedAction === 'play-action') {
        if (card === game.stagedCard) {
          console.warn('cannot target self');
          return;
        }
        if (this.isValidTarget(game, card, laneIndex)) {
          this.finalizePlay(game, undefined, card);
        }
      } else if (game.stagedAction === 'choice-followup' && this.choiceFollowupEffect) {
        console.log('checking if target valid for choice effect');
        console.log('stagedcard: ', game.stagedCard, 
          ', effect:',this.choiceFollowupEffect, ', target: ', card, 
          ', lane: ', laneIndex);
        if (this.gameService.isTargetValidForEffect(game, game.stagedCard!, 
          this.choiceFollowupEffect, card, laneIndex)) {
            console.log('valid target for choice');
          this.gameService.executeEffect(this.choiceFollowupEffect, game.stagedCard!, game, card, laneIndex);
          this.clearStaging(game);
        } else {
            console.log('invalid target for choice');
          return;
        }
      }
    } else if (game.stagedSupportActivation) {
      if (this.isValidTarget(game,card, laneIndex)) {
        this.gameService.applySupportActivation(game,game.stagedSupportActivation, card);
      }
    } else if (this.isAttackStaging && game.stagedAttack) {
      console.log('Processing attack target for', card.name);
      if (this.isValidTarget(game, card, laneIndex)) {
        if (this.animationsEnabled && !this.isProphecyStaging) {
          this.attackWithCreature(game, game.stagedAttack, card, false);
        } else {
          if (this.audioEnabled) {
            const url = this.audioService.getAudioForCard(game.stagedAttack.id, 'attack', game.stagedAttack.set);
            if (url) {
              this.audioService.queueAudio(url);
            }
          }
          this.finalizeAttack(game, card);
        }
      } else {
        console.log('Invalid attack target selected');
      }
    } else {
      console.log('Not in a valid staging state');
    }
    //this.handlePendingAction(this.game.pendingAction);
    this.updateGroupedHistory();
  }

  
  finalizeAttack(game: GameState, target?: Card | PlayerState) {
    if (!game.stagedAttack || !target) return;
    this.gameService.resolveAttack(game, game.stagedAttack, target);
    this.selectedCard = null;
    game.stagedAttack = null;
  }

  

  playProphecyCard(game: GameState, card: Card) {
    if (game.stagedProphecy !== card) return;

    //if (!card.isOpponent) {
      this.stageCardForPlay(game, card, card.isOpponent ? game.opponent : game.player);
      //this.handlePendingAction(this.game.pendingAction);
    this.updateGroupedHistory();
    //}

    console.log(`Playing Prophecy card for free: ${card.name}`);
  }

  skipProphecy(game: GameState) {
    if (!game.stagedProphecy) return;

    // Player skipped → now add the card to hand normally
    const player = game.stagedProphecy.isOpponent ? game.opponent : game.player;
    this.gameService.drawCards(player, 1, game); // Increment hand version

    
    //this.cancelButtonActive = false;
    console.log(`Prophecy skipped — ${game.stagedProphecy?.name} added to hand`);
    game.stagedProphecy = null;

    this.gameService.breakRunesIfNeeded(game, player);
    if (!game.stagedProphecy && !game.player.turn && game.cpuPlaying) {
      this.resumeOpponentTurn(game);
    }
  }

  resumeOpponentTurn(game: GameState) {
    const spinnerTimer = setTimeout(() => {
      this.cpuThinking = true;
    }, 100);
    this.cpuThinking = true;
    setTimeout(() => {
      this.invalidateHighlights();
      this.gameService.runOpponentTurn(game);
      this.saveGameState(game);
      clearTimeout(spinnerTimer);
      this.cpuThinking = false;
      this.processPendingQueue();
      this.updateGroupedHistory();
      this.invalidateHighlights();
    }, 25);
  }

  selectAll(event: Event) {
    const input = event.target as HTMLInputElement;
    input.select();
  }

  onMagickaInput(event: Event) {
    const input = event.target as HTMLInputElement;

    // Remove non-digits
    let value = input.value.replace(/[^0-9]/g, '');

    // Keep only the LAST digit typed
    if (value.length > 1) {
      value = value.slice(-1);
    }

    if (!value) {
      value = '0';
    }

    this.testStartingMaxMagicka = parseInt(value);
    input.value = value;
  }

  

  trackByHand(index: number, card: Card): string {
    // Use card.id + index so it forces re-creation when order changes
    return `${card.instanceId || card.name}-${index}`;
  }

  

  get isAttackStaging(): boolean {
    return this.game.stagedAttack !== null;
  }

  get isProphecyStaging(): boolean {
    return this.game.stagedProphecy !== null;
  }

  get isActivationStaging(): boolean {
    return this.game.stagedSupportActivation !== null;
  }

  canAttack(game: GameState, card: Card): boolean {
    if (card.laneIndex === undefined || card.laneIndex === null) return false; // sanity check
    if (card.attackCondition && 
      !this.gameService.isAttackConditionMet(card.attackCondition,card.laneIndex,
        card.isOpponent ? game.opponent : game.player)) {
      return false;
    }
    return (
      game.gameRunning &&
      card.type === 'Creature' &&
      (card.attacks ?? 0) > 0 &&
      (card.currentAttack ?? 0) > 0 &&
      !card.shackled && !card.sick &&
      ((card.isOpponent && game.opponent.turn) ||
      (!card.isOpponent && game.player.turn)) &&
      this.gameService.isCardOnBoard(game,card) &&
      !game.stagedCard &&    // no play staging
      !this.isAttackStaging       // not already attacking
    );
  }

  canActivate(game: GameState, card: Card) : boolean {
    return (
      game.gameRunning &&
      card.type === 'Support' && 
      (card.attacks ?? 0) > 0 &&
      (card.uses ?? 0) > 0 &&
      ((card.isOpponent && game.opponent.turn) ||
      (!card.isOpponent && game.player.turn)) &&
      this.gameService.isCardOnSupport(game, card) &&
      !game.stagedCard &&    // no play staging
      !this.isAttackStaging       // not already attacking
      && !this.isActivationStaging
    );
  }

  stageAttack(game: GameState, creature: Card) {
    this.invalidateHighlights();
    /*if (this.audioEnabled) {
      const url = this.audioService.getAudioForCard(creature.id, 'attack', creature.set);
      if (url) {
        this.audioService.queueAudio(url);
      }
    }*/
    game.stagedAttack = creature;
    console.log('Staged attack for', creature.name, ', lane:', creature.laneIndex);
    this.closeModal();
  }
  cancelAttack(game: GameState) {
    game.stagedAttack = null;
    this.selectedCard = null;
  }

  stageSupportActivation(game: GameState, support: Card) {
    this.invalidateHighlights();
    //close support bar
    this.selectedCard = null;
    this.showPlayerSupportBar = false;
    this.showOpponentSupportBar = false;
    this.closeModal();
    if (!support.uses || support.uses <= 0 || !support.attacks || support.attacks <= 0) {
      console.log('Support cannot be activated (no uses or attacks left)');
      return;
    }

    // Find all Activation effects
    const activationEffects = support.effects?.filter(e => e.trigger === 'Activation') || [];

    if (activationEffects.length === 0) {
      console.log('No Activation effects found on support');
      return;
    }

    // Check if ALL effects are auto-targeted → can activate immediately
    const allAuto = activationEffects.every(e => this.gameService.isAutoTarget(e.target));

    if (allAuto) {
      // No targeting needed → activate now
      this.gameService.applySupportActivation(game, support);
    } else {
      // At least one effect needs manual target → stage it
      game.stagedSupportActivation = support;
      //this.cancelButtonActive = true;
      console.log(`Staged activation for ${support.name} — waiting for target`);
      // Optional: show targeting UI/highlights here
    }
  }

  

  onPlayerTargetClick(game: GameState, target: Card | PlayerState) {
    if (this.isSummonTargeting) {
      //console.log('summon targeting');
      this.onSummonTargetClick(game,target);
      return;
    }
    if (this.isAttackStaging && game.stagedAttack && this.isValidTarget(game, target, 0)) {
      if (this.animationsEnabled && !this.isProphecyStaging) {
        this.attackWithCreature(game, game.stagedAttack, target, false);
      } else {
        this.finalizeAttack(game, target);
      }
    } else if ((game.stagedCard && game.stagedAction === 'play-action') || 
      game.stagedAction === 'choice-followup') {
        if (this.isValidTarget(game,target, 0)) {
          //console.log('trying to finalize play');
          this.finalizePlay(game, undefined, target);
        } else {
          //console.log('invalid target');
        }
    } else if (game.stagedSupportActivation !== null && this.isValidTarget(game,target,0)) {
      this.gameService.applySupportActivation(game,game.stagedSupportActivation,target);
    } else if (!this.isAttackStaging && !game.stagedCard && !game.stagedSupportActivation) {
      console.log(`hand reveal is ${this.handReveal}`);
      if (this.handReveal) {
        this.openHand();
      } else if ((target === game.player && !this.showOpponent) ||
      (target === game.opponent && this.showOpponent)) {
        this.openHand();
      }
    }
    this.invalidateHighlights();
    //this.handlePendingAction(this.game.pendingAction);
    this.updateGroupedHistory();
  }

  

  

  

  // Check if player has any possible actions
  hasPossibleActions(game: GameState, player: PlayerState): boolean {
    // 1. Any creature that can attack
    const canAttack = player.board.some(lane =>
      lane.some(c => this.canAttack(game, c))
    );

    // 2. Any support that can be activated
    const canActivateSupport = player.support.some(s => this.canActivate(game, s));

    // 3. Any card in hand that can be played
    const canPlayCard = player.hand.some(c => this.canPlayCard(game, c, player));

    return canAttack || canActivateSupport || canPlayCard;
  }

  // Check if any support has available activations
  hasAvailableSupportActivations(game: GameState): boolean {
    const player = this.showOpponent ? game.opponent : game.player;
    return player.support.some(support =>
      (support.attacks ?? 0) > 0 && (support.uses ?? 0) > 0
    );
  }

  // Toggle selection (called from card component)
  onCardSelect(card: Card, event?: Event) {
    event?.stopPropagation();   // ← Prevents bubbling to board background
    if (card.isOpponent && !this.showOpponent) {
      this.enlargeCard(card);  // enlarge immediately
      return;
    }
    if (!card.isOpponent && this.showOpponent) {
      this.enlargeCard(card);  // enlarge immediately
      return;
    }
    if (this.game.stagedCard || this.isActivationStaging || this.isAttackStaging) return;
    if (this.selectedCard?.instanceId === card.instanceId) {
      // Already selected → enlarge
      this.enlargeCard(card);
      //this.selectedCard = null;
    } else {
      // Select new card
      this.selectedCard = card;
    }
  }

  onCardHover(card: Card) {
    if (this.isTouchDevice) return; // disable hover on touch devices
    if (!this.hoverSelectEnabled) return;
    
    // Only auto-select when nothing is staged / no modal open / player's turn
    if (this.isTargeting || this.enlargedCard || this.mulliganActive) {
      return;
    }

    this.hoveredCard = card;
    this.selectedCard = card;
    
    // Optional: auto-enlarge on hover
    // this.enlargedCard = card;
  }

  onCardLeave() {
    if (!this.hoverSelectEnabled) return;
    this.hoveredCard = null;
    this.deselectCard();
    
    // If you auto-enlarged on hover, close it
    // if (this.enlargedCard === this.hoveredCard) {
    //   this.enlargedCard = null;
    // }
  }

  // Deselect when clicking elsewhere (e.g. board background, modal close, etc.)
  deselectCard() {
    if (this.game.stagedCard || this.isActivationStaging || this.isAttackStaging || this.isSummonTargeting) return;
    this.selectedCard = null;
  }

  // Call this when clicking anywhere outside cards (example: board container)
  onBoardBackgroundClick() {
    this.deselectCard();
  }

  

  // When toggling modal on
  showHistory() {
    this.showHistoryModal = true;
    this.updateGroupedHistory();           // refresh + auto-expand latest
  }

  // Rebuild grouped data whenever history changes or modal opens
  private updateGroupedHistory() {
    const map = new Map<number, HistoryEntry[]>();

    // Group by turnNumber (descending order later)
    this.game.history.forEach(entry => {
      if (!map.has(entry.turnNumber)) {
        map.set(entry.turnNumber, []);
      }
      map.get(entry.turnNumber)!.push(entry);
    });

    // Convert to array, sort descending by turn number
    this.groupedHistory = Array.from(map.entries())
      .map(([turnNumber, entries]) => ({
        turnNumber,
        entries,
        isExpanded: false   // default collapsed
      }))
      .sort((a, b) => b.turnNumber - a.turnNumber); // most recent first

    // Auto-expand the most recent turn
    if (this.groupedHistory.length > 0) {
      this.groupedHistory[0].isExpanded = true;
    }
  }

  toggleTurnExpansion(index: number) {
    // Collapse all others, expand the clicked one
    this.groupedHistory.forEach((turn, i) => {
      turn.isExpanded = i === index;
    });
  }

  showDiscard(playerSide: 'player' | 'opponent') {
    const p = playerSide === 'player' ? this.game.player : this.game.opponent;
    // You can open a modal with p.discard list
    // For now, just log
    console.log(`${playerSide} discard:`, p.discard.map(c => c.name));
  }

  openDiscard() {
    this.discardView = 'player';
    this.showDiscardModal = true;
  }

  // Switch views inside modal
  switchDiscardView(view: 'player' | 'opponent') {
    this.discardView = view;
  }

  // Close
  closeDiscardModal() {
    this.showDiscardModal = false;
  }

  openHand() {
    this.showHandModal = true;
    if (this.game.player.turn) {
      this.handView = 'player';
    } else if (this.handReveal || !this.game.cpuPlaying) {
      this.handView = 'opponent';
    }
  }

  switchHandView(view: 'player' | 'opponent') {
    this.handView = view;
  }

  closeHandModal() {
    this.showHandModal = false;
  }

  // Open/close overlay
  toggleSettingsOverlay() {
    this.showSettingsOverlay = !this.showSettingsOverlay;
  }

  toggleDeckSelector(side: 'player' | 'opponent') {
    if (this.game.gameRunning) return;  // no selection during game

    // Toggle expand/collapse
    if (this.expandedDeckSide === side) {
      this.expandedDeckSide = null;
    } else {
      this.expandedDeckSide = side;
    }

    if (this.expandedDeckSide === 'player') {
      if (!this.isExhibitionMode && !['starter','custom'].includes(this.playerDeckMode)) {
        this.playerDeckMode = 'starter';
      }
    } else if (this.expandedDeckSide === 'opponent') {
      if (!this.isExhibitionMode && !['starter','custom'].includes(this.opponentDeckMode)) {
        this.opponentDeckMode = 'starter';
      }
    }
  }

  selectDeck(side: 'player' | 'opponent', source: DeckSource, deck: DeckOption) {
    if (deck.locked && source !== 'npc' && !this.isExhibitionMode) return;

    const serialized = JSON.stringify(deck);

    if (side === 'player') {
      this.selectedPlayerDeck = deck;
      this.playerDeckMode = source;
      localStorage.setItem('exhibition_player_deck', serialized);
      console.log('Saved player deck:', deck.name);
    } else {
      this.selectedOpponentDeck = deck;
      this.opponentDeckMode = source;
      
      localStorage.setItem('exhibition_opponent_deck', serialized);
      console.log('Saved opponent deck:', deck.name);
    }

    // Optional: auto-collapse after selection
    this.expandedDeckSide = null;
  }

  // Concede game
  concede() {
    if (this.isStoryMode) {
      this.showSettingsOverlay = false;
    }
    this.showResumeModal = false;
    if (this.game.gameRunning) {
      this.gameService.logHistory(this.game,{
        player: 'You',
        actionType: 'defeat',
        description: 'You have conceded.',
        details: []
      });
      this.updateGroupedHistory();
      this.game.gameRunning = false;
    }
    localStorage.removeItem('gameSave');
    this.updateBackgroundMusic();
    if (this.isArenaMode && !this.gameOverHandled) {
      this.gameOverHandled = true;
      this.showSettingsOverlay = false;
      this.loadArenaState();            
      this.arenaState.losses = (this.arenaState.losses ?? 0) + 1;
      if (this.arenaState.losses === 3) {
        this.arenaElo += 25*(this.arenaState.wins-6);
        this.arenaElo = Math.min(2000,Math.max(800,this.arenaElo));
        localStorage.setItem('TESL_arena_elo', this.arenaElo.toString());
      }
      localStorage.setItem(this.ARENA_STATE_KEY, JSON.stringify(this.arenaState));
      this.openSoloArena();
    } else if (this.isRankedMode && !this.gameOverHandled) {
      this.gameOverHandled = true;
      this.showSettingsOverlay = false;
      localStorage.setItem('TESL_ranked_result', 'lose');
      this.openRanked();
    }
  }

  private triggerProphecyFlash() {
    this.showProphecyFlash = true;
    setTimeout(() => {
      this.showProphecyFlash = false;
    }, 500); // 500ms = 0.5 seconds
  }

  private loadDeckSelection() {
    this.loadUnlockedCards();
    const savedLayout = localStorage.getItem('tesl-layout');
    if (savedLayout === 'desktop') this.isDesktopMode = true;


    const savedCheat = localStorage.getItem('tesl_cheat');
    if (savedCheat) {
      this.activeCheat = savedCheat;
      if (this.activeCheat !== 'None') this.cheatsActive = true;
    }

    const savedCheatEver = localStorage.getItem('TESL_cheats_ever');
    if (savedCheatEver) {
      this.cheatEver = savedCheatEver === 'true';
    }

    const savedCustomDecks = localStorage.getItem('custom_decks');
    if (savedCustomDecks) {
      this.savedDecks = JSON.parse(savedCustomDecks);
      this.customDecks = this.savedDecks.map(d => this.mapToDeckOption(d,'custom'));
    }

    const savedPlayerDeck = localStorage.getItem('exhibition_player_deck');
    if (savedPlayerDeck) {
      try {
        const parsed = JSON.parse(savedPlayerDeck);
        // Validate / re-hydrate if needed (e.g. match to your current deck lists)
        this.selectedPlayerDeck = this.findMatchingDeck(parsed);
        if (!this.selectedPlayerDeck) this.selectedPlayerDeck = this.starterDecks[0];
        this.playerDeckMode = this.selectedPlayerDeck.source;
        console.log('Loaded saved player deck:', this.selectedPlayerDeck?.name);
      } catch (e) {
        console.warn('Failed to parse saved player deck:', e);
        localStorage.removeItem('exhibition_player_deck');
      }
    } else {
      this.selectedPlayerDeck = this.starterDecks[0];
      this.playerDeckMode = 'starter';
    }

    // Load saved opponent deck
    const savedOpponentDeck = localStorage.getItem('exhibition_opponent_deck');
    if (savedOpponentDeck) {
      try {
        const parsed = JSON.parse(savedOpponentDeck);
        this.selectedOpponentDeck = this.findMatchingDeck(parsed);
        if (!this.selectedOpponentDeck) this.selectedOpponentDeck = this.starterDecks[0];
        this.opponentDeckMode = this.selectedOpponentDeck.source;
        console.log('Loaded saved opponent deck:', this.selectedOpponentDeck?.name);
      } catch (e) {
        console.warn('Failed to parse saved opponent deck:', e);
        localStorage.removeItem('exhibition_opponent_deck');
      }
    } else {
      this.selectedOpponentDeck = this.starterDecks[0];
      this.opponentDeckMode = 'starter';
    }

    

    /*const arenaLoss = localStorage.getItem('TESL_arena_losses');
    if (arenaLoss !== null) {
      this.arenaLosses = parseInt(arenaLoss,10);
    }
    const arenaWin = localStorage.getItem('TESL_arena_wins');
    if (arenaWin !== null) {
      this.arenaWins = parseInt(arenaWin,10);
    }*/
    const arenaElo = localStorage.getItem('TESL_arena_elo');
    if (arenaElo !== null) {
      this.arenaElo = parseInt(arenaElo,10);
    }


    const savedStory = localStorage.getItem('forgotten_hero_progress');
    if (savedStory !== null) {
      this.lastCompletedChapterIndex = parseInt(savedStory,10);
    }
    if (this.lastCompletedChapterIndex === (this.storyChapters.length-1)) {
      console.log(`incrementing chapter index for hard mode`);
      this.lastCompletedChapterIndex = 29;
    }
    console.log(`last completed chapter is ${this.lastCompletedChapterIndex}`);

    const storedCPUtoggle = localStorage.getItem('TESL_CPUtoggle');
    if (storedCPUtoggle !== null) {
      this.cpuTogglePlaying = storedCPUtoggle === 'true';
    }
    const storedCustomToggle = localStorage.getItem('TESL_CustomSets');
    if (storedCustomToggle !== null) {
      this.customSets = storedCustomToggle === 'true';
    }
    const storedAnimationtoggle = localStorage.getItem('TESL_Animationtoggle');
    if (storedAnimationtoggle !== null) {
      this.animationsEnabled = storedAnimationtoggle === 'true';
    }
    const seenTESLhelp = localStorage.getItem('TESL_seenHelp');
    if (seenTESLhelp !== null) {
      this.isHelpVisible = false;
    } else {
      this.isHelpVisible = true;
      localStorage.setItem('TESL_seenHelp', this.isHelpVisible.toString());
    }
    const storedPlayeravatar = localStorage.getItem('TESL_PlayerAvatar');
    if (storedPlayeravatar !== null) {
      this.playerHeroImage = storedPlayeravatar;
    }
    const storedCPUavatar = localStorage.getItem('TESL_OpponentAvatar');
    if (storedCPUavatar !== null) {
      this.opponentHeroImage = storedCPUavatar;
    }
    const savedHint = localStorage.getItem('TESL_showHelpHints');
    if (savedHint !== null) {
      this.showHelpHints = JSON.parse(savedHint);
    }
    const savedTarget = localStorage.getItem('TESL_classicTargeting');
    if (savedTarget !== null) {
      this.classicTargeting = JSON.parse(savedTarget);
    }
  }

  private findMatchingDeck(saved: any): DeckOption | null {
    const allDecks = [
      ...this.starterDecks,
      ...this.randomDeckOptions,
      ...this.npcDecks,
      ...this.customDecks,
      ...this.arenaOpponents
    ];

    // Match by source + name + class (or deckCode if available)
    return allDecks.find(d =>
      d.source === saved.source &&
      d.name === saved.name
    ) || null;
  }

  // Get attributes to display (uses selected class if Random)
  getDeckAttributes(side: 'player' | 'opponent'): string[] {
    if (side === 'player') {
      return this.selectedPlayerDeck?.attributes || [];
    } else if (side === 'opponent') {
      if (this.isStoryMode && this.currentChapter.attributes) {
        return this.currentChapter.attributes;
      } else {
        return this.selectedOpponentDeck?.attributes || [];
      }
    }
    return [];
  }

  // Get display name (adds class name for Random)
  getDeckDisplayName(side: 'player' | 'opponent'): string {
    if (side === 'player') {
      return this.selectedPlayerDeck?.name || '';
    } else /*if (side === 'opponent')*/ {
      return this.selectedOpponentDeck?.name || '';
    }
  }

  dismissGameOver() {
    this.gameOverVisible = false;
    if (this.isArenaMode) this.openSoloArena();
    if (this.isRankedMode) this.openRanked();
  }

  dismissUnlock() {
    this.unlockOverlayVisible = false;
  }

  private saveCPUtoggle() {
    localStorage.setItem('TESL_CPUtoggle', this.cpuTogglePlaying.toString());
  }

  private saveAudiotoggle() {
    localStorage.setItem('TESL_Audiotoggle', this.audioEnabled.toString());
  }

  private saveAnimationtoggle() {
    localStorage.setItem('TESL_Animationtoggle', this.animationsEnabled.toString());
  }

  get currentHelpRule() {
    return this.helpRules[this.currentHelpStep];
  }

  get isFirstHelpStep() {
    return this.currentHelpStep === 0;
  }

  get isLastHelpStep() {
    return this.currentHelpStep === this.helpRules.length - 1;
  }

  nextPage() {
    if (!this.isLastHelpStep) {
      this.currentHelpStep++;
      const el = document.querySelector('.help-modal-content');
      if (el) el.scrollTop = 0;
    }
  }

  previousPage() {
    if (!this.isFirstHelpStep) {
      this.currentHelpStep--;
      const el = document.querySelector('.help-modal-content');
      if (el) el.scrollTop = 0;
    }
  }

  openAvatarModal(forPlayer: 'player' | 'opponent') {
    if (this.game.gameRunning) return; // only when game not running

    this.avatarModalFor = forPlayer;
    this.showAvatarModal = true;
  }

  selectAvatar(avatarPath: string) {
    if (this.avatarModalFor === 'player') {
      this.playerHeroImage = avatarPath;
      localStorage.setItem('TESL_PlayerAvatar', avatarPath);
    } else if (this.avatarModalFor === 'opponent') {
      this.opponentHeroImage = avatarPath;
      localStorage.setItem('TESL_OpponentAvatar', avatarPath);
    }
    this.closeAvatarModal();
  }

  closeAvatarModal() {
    this.showAvatarModal = false;
    this.avatarModalFor = null;
  }

  toggleCPU() {
    this.cpuTogglePlaying = !this.cpuTogglePlaying;
    this.game.cpuPlaying = this.cpuTogglePlaying;
    this.saveCPUtoggle();
  }

  toggleStoryDifficulty() {
    if (this.storyDifficulty === 'normal') {
      this.storyDifficulty = 'hard';
      //console.log('hard mode');
    } else {
      this.storyDifficulty = 'normal';
      //console.log('normal mode');
    }
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    if (!this.audioEnabled) {
      this.audioService.stopAllAudio();
    }
    this.saveAudiotoggle();
    this.updateMusicVolume();
  }

  toggleAnimations() {
    this.animationsEnabled = !this.animationsEnabled;
    if (this.game.gameRunning) this.game.useAnimation = this.animationsEnabled;
    this.saveAnimationtoggle();
  }

  showHelpModal() {
    this.isHelpVisible = true;
    this.showSettingsOverlay = false;
  }

  closeHelpModal() {
    this.isHelpVisible = false;
    this.currentHelpStep = 0; // reset for next time
  }

  getSummonText(card: Card): string {
    if (!card.text) return 'Summoning...';

    // Extract text after "Summon :" until first period
    const summonIndex = card.text.toLowerCase().indexOf('summon :');
    if (summonIndex === -1) return card.text;

    const afterSummon = card.text.substring(summonIndex + 8).trim(); // skip "Summon :"
    const periodIndex = afterSummon.indexOf('.');

    if (periodIndex === -1) {
      return afterSummon.trim();
    }

    return afterSummon.substring(0, periodIndex + 1).trim();
  }

  showTemporaryHint(message: string, duration?: number) {
    if (!this.showHelpHints) return;   // respect user preference

    // Clear any existing timeout
    if (this.hintTimeout) {
      clearTimeout(this.hintTimeout);
    }

    // Show new message
    this.currentHintMessage = message;
    this.cdr.detectChanges();

    // Auto-hide after 2 seconds
    this.hintTimeout = setTimeout(() => {
      this.currentHintMessage = null;
      this.hintTimeout = null;
    }, (duration ?? 2000));
  }

  // Call this whenever a card is burned
  showBurnHint(card: Card, isOpponent: boolean) {
    const message = card.id === 'out-of-cards' ? `Destroy your front rune!` : `Burned ${card.name}`;
    this.burnQueue.push({ message, isOpponent, card });
    this.processBurnQueue();
  }

  // Process next in queue (non-blocking)
  private processBurnQueue() {
    if (this.burnQueue.length === 0 || this.currentBurnMessage !== null) {
      return; // already showing one
    }

    const next = this.burnQueue.shift()!;
    this.currentBurnMessage = next.message;
    this.currentBurnIsOpponent = next.isOpponent;
    this.lastBurnedCard = next.card;
    this.burnHintVisible = true;

    // Auto-hide after 2 seconds
    let timeout = 2000;
    let interval = 400;
    if (this.burnQueue.length >= 5) {
      timeout = 1000;
      interval = 200;
    }
    this.burnHintTimeout = setTimeout(() => {
      this.currentBurnMessage = null;
      this.currentBurnIsOpponent = false;
      this.lastBurnedCard = null;
      this.burnHintVisible = false;

      // Check queue again after hide
      setTimeout(() => this.processBurnQueue(), interval); // small delay for fade-out
    }, 1000);
  }

  // Clear hint immediately when action is taken (call in onEndTurn, playCard, etc.)
  clearHint() {
    if (this.hintTimeout) {
      clearTimeout(this.hintTimeout);
      this.hintTimeout = null;
    }
    this.currentHintMessage = null;
  }

  onHintToggle() {
  // Optional: save to localStorage for persistence
    localStorage.setItem('TESL_showHelpHints', JSON.stringify(this.showHelpHints));
    
    // If turned off → hide current hint
    if (!this.showHelpHints) {
      this.clearHint();
    }
  }

  onTargetToggle() {
    localStorage.setItem('TESL_classicTargeting', JSON.stringify(this.classicTargeting));
  }

  onCustomToggle() {
    localStorage.setItem('TESL_CustomSets', JSON.stringify(this.customSets));
  }

  // Called when user clicks "Resume"
  resumeSavedGame(game: GameState) {
    this.showResumeModal = false;
    this.isMainMenu = false;
    this.showGameBoard = true;
    // Now actually restore
    const json = localStorage.getItem('gameSave');
    if (json) {
      const saved = JSON.parse(json);
      this.restoreGameState(game, saved);
      console.log('Game restored from turn', saved.turnNumber);
    }
  }

  // Called when user clicks "New Game"
  startNewGameFromModal() {
    this.showResumeModal = false;
    this.isMainMenu = false;
    this.showGameBoard = true;
    localStorage.removeItem('gameSave');
    this.callStartGame();  // your normal new game logic
    //this.game = { ...this.game };  // shallow copy trick to trigger change detection
  }
  
  private async loadGameState() {
    try {
      //const saved = await this.loadFromIndexedDB('gameSave');
      const json = localStorage.getItem('gameSave');

      if (!json) {
        console.log('No saved game found — starting fresh');
        return false;
      }

      const saved: SavedGameState = JSON.parse(json);

      if (saved.version !== 7) {
        console.warn('Saved game version mismatch — starting fresh');
        return false;
      }

      // Show resume dialog
      // Show styled modal instead of confirm()
      this.resumeTurnNumber = saved.turnNumber;
      if (saved.arenaMode) this.isArenaMode = true;
      if (saved.rankedMode) this.isRankedMode = true;
      this.showResumeModal = true;
      return false;
    } catch (error) {
      console.warn('Failed to load game state:', error);
      return false;
    }
  }

  private async saveGameState(game: GameState) {
    if (this.game.cpuPlaying && !this.game.player.turn) {
      console.log('Skipping save during CPU turn');
      return;
    }
    try {
      const state: SavedGameState = {
        version: 7,
        storyMode: this.isStoryMode,
        storyChapterIndex: this.currentChapterIndex,
        arenaMode: this.isArenaMode,
        rankedMode: this.isRankedMode,
        animationsEnabled: this.animationsEnabled,
        turnNumber: game.currentTurn,           // your turn counter
        cpuPlaying: game.cpuPlaying,
        firstPlayer: game.firstPlayer,
        tempCostAdjustment: game.tempCostAdjustment,
        laneTypes: game.laneTypes,
        player: this.deckService.serializePlayer(game.player),
        opponent: this.deckService.serializePlayer(game.opponent),
        history: game.history.map(entry => ({ ...entry }))  // deep copy
      };

      // Save to IndexedDB (best for PWA) OR localStorage (simpler)
      //await this.saveToIndexedDB('gameSave', state);
      localStorage.setItem('gameSave', JSON.stringify(state));

      console.log('Game saved at turn: ', game.currentTurn, '; chapter: ', this.currentChapterIndex);
    } catch (error) {
      console.warn('Failed to save game state:', error);
    }
  }

  private async restoreGameState(game: GameState, saved: SavedGameState) {
    // Restore basic state
    this.isStoryMode = saved.storyMode;
    this.isArenaMode = saved.arenaMode;
    this.isRankedMode = saved.rankedMode;
    this.isExhibitionMode = !this.isStoryMode && !this.isArenaMode;
    this.currentChapterIndex = saved.storyChapterIndex;
    if (saved.storyChapterIndex >= 30) this.storyDifficulty = 'hard';
    const chOffset = saved.storyChapterIndex >= 30 ? -30: 0;
    console.log(`current chapter is ${this.currentChapterIndex}`);
    if (saved.storyMode) {
      this.currentChapter = this.storyChapters[this.currentChapterIndex + chOffset];
      console.log(`current chapter is ${this.currentChapter.chapter}`);
    }
    game.useAnimation = this.animationsEnabled;
    game.currentTurn = saved.turnNumber;
    game.currentRound = Math.floor((saved.turnNumber+1) / 2);
    game.cpuPlaying = saved.cpuPlaying;
    game.classicTargeting = this.classicTargeting;
    game.firstPlayer = saved.firstPlayer;
    game.laneTypes = saved.laneTypes;
    game.tempCostAdjustment = saved.tempCostAdjustment ?? 0;

    // Restore players
    await this.deckService.restorePlayer(game.player, saved.player, false);
    await this.deckService.restorePlayer(game.opponent, saved.opponent, true);


    // Re-apply auras, static buffs, etc.
    this.gameService.updateStaticBuffs(game, game.player);
    this.gameService.updateStaticBuffs(game, game.opponent);

    //not sure if needed
    this.gameService.reapplyHandAuras(game.player);
    this.gameService.reapplyHandAuras(game.opponent);
    game.gameRunning = true;

    if (saved.history) {
      game.history = saved.history.map(entry => ({ ...entry }));
    } else {
      game.history = [];
    }
    
    this.updateGroupedHistory();  // rebuild groups after load
    this.updateBackgroundMusic();

  }

  addClone(handCardEl: Element | null, startX: number, startY: number, card: Card, startRect: DOMRect): HTMLElement {
    let clone: HTMLElement | null = null;
    if (handCardEl) {
      clone = (handCardEl as HTMLElement).cloneNode(true) as HTMLElement;
    } else {
      clone = document.createElement('div');
      clone.innerHTML = `
      <div class="card" style="width:100%;height:100%;border:2px solid #ffaa00;">
        <img src="${this.getCardImage(card)}" style="width:100%;height:100%;object-fit:contain;">
        <div style="position:absolute;bottom:8px;left:50%;transform:translateX(-50%);color:white;font-size:11px;text-shadow:0 0 4px black;">
          ${card.name}
        </div>
      </div>`;
    }
    clone.style.position = 'fixed';
    clone.style.zIndex = '9999';
    clone.style.left = `${startX}px`;
    clone.style.top = `${startY}px`;
    clone.style.width = handCardEl ? `${(handCardEl as HTMLElement).offsetWidth}px` : `${startRect.width}px`;
    clone.style.height = handCardEl ? `${(handCardEl as HTMLElement).offsetHeight}px` : `${startRect.height}px`;
    document.body.appendChild(clone);
    if (handCardEl) (handCardEl as HTMLElement).classList.add('anim-hidden');
    return clone;
  }

  playCreatureToLane(game: GameState, card: Card, laneIndex: number, isOpponent: boolean) {
    //const stagedCardAtStart = game.stagedCard;

    let handCardEl: Element | null = null;  
    if (!isOpponent) {
      handCardEl = document.querySelector(`[data-instance-id="${card.instanceId}"]`);
    }

    const queryLane = card.isOpponent ? laneIndex : (laneIndex + 2);

    const laneEl = document.querySelector(`[data-lane="${queryLane}"]`);
    if (!laneEl) {
      console.log('lane not found');
      return;
    }
    game.waitingOnAnimation = true;

    let startRect: DOMRect;
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;
    const endRect = laneEl.getBoundingClientRect();
    if (!isOpponent && handCardEl) {
      startRect = handCardEl.getBoundingClientRect();
      startX = (handCardEl as HTMLElement).offsetLeft;
      startY = (handCardEl as HTMLElement).offsetTop;
      let currentEl = (handCardEl as HTMLElement).offsetParent as HTMLElement | null;

      while (currentEl && currentEl !== document.body) {
        startX += currentEl.offsetLeft;
        startY += currentEl.offsetTop;
        currentEl = currentEl.offsetParent as HTMLElement;
      }

      const xShift = startX - startRect.left;
      const yShift = startY - startRect.top;

      endX = endRect.left + endRect.width / 2 + xShift;
      endY = endRect.top + endRect.height / 2 + yShift;
    } else {
      const containerRect = document.querySelector('.game-board-container')?.getBoundingClientRect() 
                        || document.body.getBoundingClientRect();

      startX = containerRect.left + containerRect.width * 0.5 + 30;   
      startY = containerRect.top - 50;                            

      startRect = new DOMRect(startX, startY, 105, 150); 
      endX = endRect.left + endRect.width / 2;
      endY = endRect.top + endRect.height / 8;
    }

    const clone = this.addClone(handCardEl,startX, startY, card, startRect);    

    gsap.to(clone, {
      duration: isOpponent ? 0.8 : 0.4,
      left: endX,
      top: endY,
      scale: 1.1,
      rotation: 5,
      ease: "power2.out",
      onComplete: () => {
        if (this.audioEnabled) {
          const url = this.audioService.getAudioForCard(card.id, 'enter', card.set);
          if (url) {
            this.audioService.queueAudio(url);
          }
        }
        game.waitingOnAnimation = false;
        clone.remove();
        // Place real card on board
        if (isOpponent) {
          this.gameService.opponentPlayCard(game, card, laneIndex);
          this.resumeOpponentTurn(game);
        } else {
          this.gameService.playCard(game,card, card.isOpponent, laneIndex, undefined, this.isProphecyStaging);
          this.handleSummonStageInfo(game);
          this.clearStaging(this.game);
          this.updateGroupedHistory();
          this.invalidateHighlights();
        }
      }
    });
  }

  playActionToLane(game: GameState, card: Card, laneIndex: number, isOpponent: boolean) {
    //const stagedCardAtStart = game.stagedCard;
    let handCardEl: Element | null = null;  
    if (!isOpponent) {
      handCardEl = document.querySelector(`[data-instance-id="${card.instanceId}"]`);
    }   

    const queryLane = card.isOpponent ? laneIndex : (laneIndex + 2);

    const laneEl = document.querySelector(`[data-lane="${queryLane}"]`);
    if (!laneEl) {
      console.log('lane not found');
      return;
    }
    game.waitingOnAnimation = true;

    let startRect: DOMRect;
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;
    const endRect = laneEl.getBoundingClientRect();
    if (!isOpponent && handCardEl) {
      startRect = handCardEl.getBoundingClientRect();

      startX = (handCardEl as HTMLElement).offsetLeft;
      startY = (handCardEl as HTMLElement).offsetTop;
      let currentEl = (handCardEl as HTMLElement).offsetParent as HTMLElement | null;

      while (currentEl && currentEl !== document.body) {
        startX += currentEl.offsetLeft;
        startY += currentEl.offsetTop;
        currentEl = currentEl.offsetParent as HTMLElement;
      }

      const xShift = startX - startRect.left;
      const yShift = startY - startRect.top;

      endX = endRect.left + endRect.width / 2 + xShift;
      endY = endRect.top + endRect.height / 2 + yShift;
    } else {
      const containerRect = document.querySelector('.game-board-container')?.getBoundingClientRect() 
                        || document.body.getBoundingClientRect();

      startX = containerRect.left + containerRect.width * 0.5 + 30;   
      startY = containerRect.top - 50;                            

      startRect = new DOMRect(startX, startY, 105, 150); 
      endX = endRect.left + endRect.width / 2;
      endY = endRect.top + endRect.height / 2;
    }

    const clone = this.addClone(handCardEl,startX, startY, card, startRect);    

    gsap.to(clone, {
      duration: 0.4,
      left: endX,
      top: endY,
      scale: 1.1,
      rotation: 5,
      ease: "power2.out",
      onComplete: () => {
        if (this.audioEnabled) {
          const url = this.audioService.getAudioForCard(card.id, 'enter', card.set);
          if (url) {
            this.audioService.queueAudio(url);
          }
        }
        game.waitingOnAnimation = false;
        clone.remove();
        if (isOpponent) {
          this.gameService.opponentPlayCard(game, card, laneIndex, undefined);
          this.resumeOpponentTurn(game);
        } else {
          this.gameService.playCard(game,card, card.isOpponent, laneIndex, undefined, this.isProphecyStaging);        
          this.clearStaging(this.game);
          this.updateGroupedHistory();
          this.invalidateHighlights();
        }
      }
    });
  }

  playActionToCard(game: GameState, card: Card, target: Card | PlayerState, isOpponent: boolean) {
    let attackerEl: Element | null = null;  
    if (!isOpponent) {
      attackerEl = document.querySelector(`[data-instance-id="${card.instanceId}"]`);
    }   
    const defenderEl = this.gameService.isCard(target) ? 
      document.querySelector(`[data-instance-id="${target.instanceId}"]`) :
      (target === game.player ? document.querySelector('.player-hero')
      : document.querySelector('.opponent-hero'));

    if ((!isOpponent && !attackerEl) || !defenderEl) return;
    game.waitingOnAnimation = true;

    let startRect: DOMRect;
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;
    const endRect = defenderEl.getBoundingClientRect();
    if (!isOpponent && attackerEl) {
      startRect = attackerEl.getBoundingClientRect();

      startX = (attackerEl as HTMLElement).offsetLeft;
      startY = (attackerEl as HTMLElement).offsetTop;
      let currentEl = (attackerEl as HTMLElement).offsetParent as HTMLElement | null;

      while (currentEl && currentEl !== document.body) {
        startX += currentEl.offsetLeft;
        startY += currentEl.offsetTop;
        currentEl = currentEl.offsetParent as HTMLElement;
      }

      const xShift = startX - startRect.left;
      const yShift = startY - startRect.top;

      endX = endRect.left + xShift;
      endY = endRect.top + yShift;
    } else {
      const containerRect = document.querySelector('.game-board-container')?.getBoundingClientRect() 
                        || document.body.getBoundingClientRect();

      startX = containerRect.left + containerRect.width * 0.5 + 30;  
      startY = containerRect.top - 50;        

      startRect = new DOMRect(startX, startY, 105, 150); 
      endX = endRect.left;
      endY = endRect.top;
    }

    const clone = this.addClone(attackerEl,startX, startY, card, startRect);    

    gsap.to(clone, {
      duration: 0.4,
      left: endX,
      top: endY, 
      scale: 1.1,
      rotation: 5,
      ease: "power2.out",
      onComplete: () => {
        game.waitingOnAnimation = false;
        clone.remove();
        if (isOpponent) {
          this.gameService.opponentPlayCard(game, card, undefined, target);
          this.resumeOpponentTurn(game);
        } else {
          this.gameService.playCard(game,card, card.isOpponent, undefined, target, this.isProphecyStaging);        
          this.clearStaging(this.game);
          this.updateGroupedHistory();
          this.invalidateHighlights();
        }
      }
    });
  }

  playSupportToBar(game: GameState, card: Card, isOpponent: boolean) {
    //const stagedCardAtStart = game.stagedCard;
    let handCardEl: Element | null = null;  
    if (!isOpponent) {
      handCardEl = document.querySelector(`[data-instance-id="${card.instanceId}"]`);
    }   
    game.waitingOnAnimation = true;
    const supportEl = card.isOpponent ? document.querySelector('.opponent-support')
      : document.querySelector('.player-support');
    if (!supportEl) return;
    const endRect = supportEl.getBoundingClientRect();

    let startRect: DOMRect;
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;
    if (!isOpponent && handCardEl) {
      startRect = handCardEl.getBoundingClientRect();

      startX = (handCardEl as HTMLElement).offsetLeft;
      startY = (handCardEl as HTMLElement).offsetTop;
      let currentEl = (handCardEl as HTMLElement).offsetParent as HTMLElement | null;

      while (currentEl && currentEl !== document.body) {
        startX += currentEl.offsetLeft;
        startY += currentEl.offsetTop;
        currentEl = currentEl.offsetParent as HTMLElement;
      }
      endX = endRect.left + endRect.width / 2;
      endY = endRect.top + endRect.height / 2;
    } else {
      const containerRect = document.querySelector('.game-board-container')?.getBoundingClientRect() 
                        || document.body.getBoundingClientRect();

      startX = containerRect.left + containerRect.width * 0.5 + 30;   
      startY = containerRect.top - 50;                           

      startRect = new DOMRect(startX, startY, 105, 150); 
      endX = endRect.left + endRect.width / 2;
      endY = endRect.top + endRect.height / 2;
    }

    const clone = this.addClone(handCardEl,startX, startY, card, startRect);    

    gsap.to(clone, {
      duration: 0.4,
      left: endX,
      top: endY,
      scale: 1.1,
      rotation: 5,
      ease: "power2.out",
      onComplete: () => {
        if (this.audioEnabled) {
          const url = this.audioService.getAudioForCard(card.id, 'enter', card.set);
          if (url) {
            this.audioService.queueAudio(url);
          }
        }
        game.waitingOnAnimation = false;
        clone.remove();
        if (isOpponent) {
          this.gameService.opponentPlayCard(game, card);
          this.resumeOpponentTurn(game);
        } else {
          this.gameService.playCard(game,card,card.isOpponent,undefined,undefined,this.isProphecyStaging); // Supports don't need targeting
          this.clearStaging(game);
          this.updateGroupedHistory();
          this.invalidateHighlights();
        }
      }
    });
  }

  playItemToCard(game: GameState, card: Card, target: Card, isOpponent: boolean) {
    let attackerEl: Element | null = null;  
    if (!isOpponent) {
      attackerEl = document.querySelector(`[data-instance-id="${card.instanceId}"]`);
    }  
    const defenderEl = document.querySelector(`[data-instance-id="${target.instanceId}"]`);

    if ((!isOpponent && !attackerEl) || !defenderEl) return;
    game.waitingOnAnimation = true;

    let startRect: DOMRect;
    let startX: number;
    let startY: number;
    let endX: number;
    let endY: number;
    const endRect = defenderEl.getBoundingClientRect();
    if (!isOpponent && attackerEl) {
      startRect = attackerEl.getBoundingClientRect();

      startX = (attackerEl as HTMLElement).offsetLeft;
      startY = (attackerEl as HTMLElement).offsetTop;
      let currentEl = (attackerEl as HTMLElement).offsetParent as HTMLElement | null;

      while (currentEl && currentEl !== document.body) {
        startX += currentEl.offsetLeft;
        startY += currentEl.offsetTop;
        currentEl = currentEl.offsetParent as HTMLElement;
      }

      const xShift = startX - startRect.left;
      const yShift = startY - startRect.top;

      endX = endRect.left + xShift;
      endY = endRect.top + yShift;
    } else {
      const containerRect = document.querySelector('.game-board-container')?.getBoundingClientRect() 
                        || document.body.getBoundingClientRect();

      startX = containerRect.left + containerRect.width * 0.5 + 30;  
      startY = containerRect.top - 50;

      startRect = new DOMRect(startX, startY, 105, 150);
      endX = endRect.left;
      endY = endRect.top;
    }

    const clone = this.addClone(attackerEl,startX, startY, card, startRect);        

    gsap.to(clone, {
      duration: 0.4,
      left: endX,
      top: endY,
      scale: 1.1,
      rotation: 5,
      ease: "power2.out",
      onComplete: () => {
        game.waitingOnAnimation = false;
        clone.remove();
        if (isOpponent) {
          this.gameService.opponentPlayCard(game, card, undefined, target);
          this.resumeOpponentTurn(game);
        } else {
          this.gameService.playCard(game,card, card.isOpponent, undefined, target, this.isProphecyStaging);
          this.handleSummonStageInfo(game);
          this.clearStaging(this.game);
          this.updateGroupedHistory();
          this.invalidateHighlights();
        }
      }
    });
  }

  targetWithSummon(game: GameState, attacker: Card, defender: Card | PlayerState, icon: string) {
    let attackerEl = document.querySelector(`[data-instance-id="${attacker.instanceId}"]`);
    if (attacker.type === 'Item') {
      const wielder = this.gameService.findWielderOfItem(game, attacker);
      if (!wielder) return;
      attackerEl = document.querySelector(`[data-instance-id="${wielder.instanceId}"]`);
    }
    const defenderEl = this.gameService.isCard(defender)
      ? document.querySelector(`[data-instance-id="${defender.instanceId}"]`)
      : (defender === game.player ? document.querySelector('.player-hero')
      : document.querySelector('.opponent-hero'));

    if (!attackerEl || !defenderEl) return;
    game.waitingOnAnimation = true;
    let iconUrl = `/assets/tesl/images/icons/summon_${icon}.png`;
    if (icon === 'shackle') {
      iconUrl = `/assets/tesl/images/icons/LG-icon-Shackle.png`;
    } else if (icon === 'silence') {
      iconUrl = `/assets/tesl/images/icons/LG-icon-Silence.png`;
    }

    const startRect = attackerEl.getBoundingClientRect();
    const endRect = defenderEl.getBoundingClientRect();

    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;

    const iconEl = document.createElement('img');
    iconEl.src = iconUrl;
    iconEl.alt = 'Summon icon';
    iconEl.style.position = 'fixed';
    iconEl.style.left = `${startX - 24}px`;
    iconEl.style.top = `${startY - 24}px`;
    iconEl.style.width = '48px';
    iconEl.style.height = '48px';
    iconEl.style.zIndex = '9999';
    iconEl.style.pointerEvents = 'none';
    iconEl.style.opacity = '1';
    document.body.appendChild(iconEl);

    gsap.to(attackerEl, { duration: 0.1, x: -8, yoyo: true, repeat: 3 });

    gsap.to(iconEl, {
      duration: 0.4,
      left: endRect.left + (endRect.width) / 2 - 24,
      top: endRect.top + (endRect.height) / 2 - 24,
      scale: 1.1,
      rotation: 5,
      ease: "power2.out",
      onComplete: () => {
        game.waitingOnAnimation = false;
        attacker.effects?.forEach(effect => {
          if (effect.trigger === 'Summon') {
            this.gameService.executeEffect(effect, attacker, game, defender);
          }
        });
        this.updateGroupedHistory();
        this.invalidateHighlights();
        // Hit impact
        gsap.to(defenderEl, {
          duration: 0.08,
          x: 12,
          yoyo: true,
          repeat: 3,
          ease: "power1.inOut"
        });

        gsap.to(defenderEl, {
          background: "rgba(255,0,0,0.4)",
          duration: 0.15,
          yoyo: true,
          repeat: 1
        });

        iconEl.remove();
      }
    });
  }

  attackWithCreature(game: GameState, attacker: Card, defender: Card | PlayerState, isOpponent: boolean) {
    game.waitingOnAnimation = true;

    if (this.audioEnabled) {
      const url = this.audioService.getAudioForCard(attacker.id, 'attack', attacker.set);
      if (url) {
        this.audioService.queueAudio(url);
      }
    }
    const tryFindElement = (attempt = 0) => {
      const attackerEl = document.querySelector(`[data-instance-id="${attacker.instanceId}"]`);
      const defenderEl = this.gameService.isCard(defender)
        ? document.querySelector(`[data-instance-id="${defender.instanceId}"]`)
        : (defender === game.player 
            ? document.querySelector('.player-hero')
            : document.querySelector('.opponent-hero'));
      
      if (attempt > 1) console.log(`Attempt ${attempt + 1}: attackerEl:`, attackerEl, 'defenderEl:', defenderEl);

      if (attackerEl && defenderEl) {
        this.performAttackAnimation(attackerEl, defenderEl, attacker, defender, isOpponent, game);
        return;
      }

      // Not found yet → retry or fallback
      if (attempt < 6) {  // ~600ms total max
        const delay = 50 * (attempt + 1);
        setTimeout(() => tryFindElement(attempt + 1), delay);
      } else {
        console.warn('Failed to find attack elements after retries — instant resolve');
        game.waitingOnAnimation = false;

        if (isOpponent) {
          this.gameService.resolveOpponentAttack(game, attacker, defender);
          game.stagedAttack = null;
          this.resumeOpponentTurn(game);
          
        } else {
          this.finalizeAttack(game, defender);
          this.updateGroupedHistory();
          this.invalidateHighlights();
        }
      }
    };

    // Start the retry process
    tryFindElement();
  }

  private performAttackAnimation(
    attackerEl: Element, 
    defenderEl: Element, 
    attacker: Card, 
    defender: Card | PlayerState, 
    isOpponent: boolean, 
    game: GameState
  ) {
    const startRect = attackerEl.getBoundingClientRect();
    const endRect = defenderEl.getBoundingClientRect();

    const clone = attackerEl.cloneNode(true) as HTMLElement;
    clone.style.position = 'fixed';
    clone.style.zIndex = '9999';
    clone.style.left = `${startRect.left}px`;
    clone.style.top = `${startRect.top}px`;
    clone.style.width = `${startRect.width}px`;
    clone.style.height = `${startRect.height}px`;
    document.body.appendChild(clone);
    (attackerEl as HTMLElement).classList.add('anim-hidden');

    gsap.to(attackerEl, { duration: 0.1, x: -8, yoyo: true, repeat: 3 });

    gsap.to(clone, {
      duration: 0.6,
      left: endRect.left + (endRect.width - startRect.width) / 2,
      top: endRect.top + (endRect.height - startRect.height) / 2,
      scale: 1.1,
      rotation: 5,
      ease: "power2.out",
      onComplete: () => {
        game.waitingOnAnimation = false;

        if (isOpponent) {
          this.gameService.resolveOpponentAttack(game, attacker, defender);
          game.stagedAttack = null;
          this.resumeOpponentTurn(game);
        } else {
          this.finalizeAttack(game, defender);
          this.updateGroupedHistory();
          this.invalidateHighlights();
        }
        (attackerEl as HTMLElement).classList.remove('anim-hidden');

        // Hit impact
        gsap.to(defenderEl, {
          duration: 0.08,
          x: 12,
          yoyo: true,
          repeat: 3,
          ease: "power1.inOut"
        });

        gsap.to(defenderEl, {
          background: "rgba(255,0,0,0.4)",
          duration: 0.15,
          yoyo: true,
          repeat: 1
        });

        clone.remove();
      }
    });
  }

  /*selectArenaClass(name: string) {
    this.arenaClass = name;
    const cardsArena = this.deckService.getAllCards().filter(c => c.tier && c.tier !== 'U');
    const classArena = this.classes.find(cls => cls.name === name);
    if (classArena) {
      this.arenaClassCards = cardsArena.filter(c =>
      (c.attributes.length === 1 && ['N',...classArena.attributes].includes(c.attributes[0])) ||
      (c.attributes.length === 2 &&
        classArena.attributes[0] === c.attributes[0] && classArena.attributes[1] === c.attributes[1]));
    }
  }*/

  /*getSetOfThree() {
    const roll = Math.random();
    let rarity = '1Common';
    if (roll < .0232) {
      rarity = '4Legendary';
    } else if (roll < (.0232+.1036)) {
      rarity = '3Epic';
    } else if (roll < (.0232+.1036+.2595)) {
      rarity = '2Rare';
    }
    const cardsRarity = this.arenaClassCards.filter(c => c.rarity === rarity);
    const pickOne = this.utilityService.random(cardsRarity);
    let cardsBucket = cardsRarity.filter(c => c.tier === pickOne.tier);
    if (cardsBucket.length < 3) {
      let bucketTiers = [pickOne.tier];
      if (pickOne.tier === 'S') bucketTiers.push('A');
      if (pickOne.tier === 'E') bucketTiers.push('D');
      if (pickOne.tier === 'A') bucketTiers.push('S');
      if (pickOne.tier === 'D') bucketTiers.push('E');
      cardsBucket = cardsRarity.filter(c => bucketTiers.includes(c.tier));
    }
    cardsBucket = cardsBucket.filter(c => c.id !== pickOne.id);
    const pickTwo = this.utilityService.random(cardsBucket);
    cardsBucket = cardsBucket.filter(c => c.id !== pickTwo.id);
    const pickThree = this.utilityService.random(cardsBucket);
  }*/

  get acts() {
    const actsMap = new Map<number, any[]>();
    this.storyChapters.forEach(ch => {
      if (!actsMap.has(ch.act)) actsMap.set(ch.act, []);
      actsMap.get(ch.act)!.push(ch);
    });
    return Array.from(actsMap.entries()).sort((a, b) => a[0] - b[0]);
  }

  startStoryMode() {
    this.isMainMenu = false;
    this.isStoryMode = true;
    this.currentChapterIndex = 0;
    if (!this.deckValid()) {
      this.selectedPlayerDeck = this.starterDecks[0];
      this.playerDeckMode = 'starter';
    }
   // this.loadCurrentChapter();
  }

  toggleAct(act: number) {
    this.expandedAct = this.expandedAct === act ? null : act;
    //console.log(`current chapter ${this.currentChapterIndex}. last completed ${this.lastCompletedChapterIndex}`);
  }

  get hardMode(): boolean {
    if (this.storyDifficulty === 'hard') return true;
    return false;
  }

  startChapter(chapter: any) {
    this.currentChapter = chapter;
    this.currentChapterDefeated = false;
    this.currentChapterIndex = this.storyChapters.indexOf(chapter);
    if (this.hardMode) this.currentChapterIndex += 30;
    console.log(`starting chapter ${this.currentChapterIndex}`);

    if (chapter.startVideo && this.animationsEnabled) {
      this.currentDialogue = chapter.startDialogue || '';
      this.playVideo(`/assets/tesl/story/forgotten_hero/video/${chapter.startVideo}.mp4`,'start');
    } else if (chapter.opponent) {
      this.startStoryFight(chapter);
    } else {
      this.goToNextChapter();
    }
  }

  onVideoEnd() {
    const videoEl = document.querySelector('video') as HTMLVideoElement | null;
    if (videoEl) {
      videoEl.pause();
    }

    // Give browser ~300–500ms to finish rendering last frame
    //setTimeout(() => {
      this.currentVideo = null;
      this.currentDialogue = '';
      this.updateMusicVolume();
      //console.log('checking chapter');
      const chapter = this.currentChapter;
      if (!chapter) {
        this.backToMenu();
        return;
      }
      //console.log(`handling video end. it was ${this.currentVideoJustPlayed}`);
      // Case 1: This was the START video
      if (this.currentVideoJustPlayed === 'start') {
        this.currentVideoJustPlayed = null;

        if (chapter.opponent) {
          // Has a fight → start the battle
          this.startStoryFight(chapter);
        } else {
          // No fight (Prologue/Interlude) → play endVideo if it exists
          if (chapter.endVideo) {
            //console.log('play end video');
            setTimeout(() => {
              this.currentDialogue = chapter.endDialogue || '';
              this.playVideo(`/assets/tesl/story/forgotten_hero/video/${chapter.endVideo}.mp4`, 'end');
            }, 300);   // 300ms delay — usually enough
            //this.playVideo(`/assets/tesl/story/forgotten_hero/video/${chapter.endVideo}.mp4`,'end');
          } else {
            // No endVideo → go to next chapter
            //console.log('go to next chapter');
            this.goToNextChapter();
          }
        }
        return;
      }

      // Case 2: This was the END video
      if (this.currentVideoJustPlayed === 'end') {
        //console.log('finished end video');
        this.currentVideoJustPlayed = null;
        this.goToNextChapter();
        return;
      }
      //console.log('fallback');
      // Fallback
      this.goToNextChapter();
    //}, 400);   // adjust 200–600ms based on your video resolution/framerate
  }

  private goToNextChapter() {
    this.updateMusicVolume();
    let refIndex = this.currentChapterIndex;
    //if (this.hardMode) refIndex += 30;
    if (refIndex > this.lastCompletedChapterIndex) {
      this.lastCompletedChapterIndex = refIndex;
      if (this.lastCompletedChapterIndex === (this.storyChapters.length-1)) {
        this.lastCompletedChapterIndex = 29;
      }
      this.unlockedStarterDecks();
      localStorage.setItem('forgotten_hero_progress', this.currentChapterIndex.toString());
    }
    this.currentChapterIndex++;


    if (this.currentChapterIndex >= 
      (this.hardMode ? (this.storyChapters.length+30) : this.storyChapters.length)) {
      console.log('Story complete!');
      this.backToMenu();
    }
  }

  chapterClass(localIndex: number): string {
    if (this.unlockedAll) return 'completed'
    const chOffset = this.hardMode ? 30: 0;
    const refLast = this.lastCompletedChapterIndex;
    const refChapter = this.chapterIndex(localIndex) + chOffset;
    if (refChapter <= refLast) {
      return 'completed';
    } else if (refChapter === refLast + 1) {
      return 'current';
    } else {
      return 'locked';
    }
  }

  chapterIndex(localIndex: number): number {
    let globalIndex = 0;
    for (const actEntry of this.acts) {
      if (actEntry[0] === this.expandedAct) {
        return globalIndex + localIndex;
      }
      globalIndex += actEntry[1].length;
    }
    return -1; // fallback
  }

  resetStoryProgress() {
    if (confirm('Reset all story progress?')) {
      localStorage.removeItem('forgotten_hero_progress');
      this.lastCompletedChapterIndex = -1;
      this.backToMenu();
    }
  }

  getActStatus(actNumber: number): 'all-completed' | 'all-locked' | 'mixed' {
    if (this.unlockedAll) return 'all-completed';
    const chOffset = this.hardMode ? 30 : 0;
    const actChapters = this.storyChapters.filter(ch => ch.act === actNumber);
    if (actChapters.length === 0) return 'mixed';

    const allCompleted = actChapters.every(ch => (ch.chapter+chOffset) <= this.lastCompletedChapterIndex);
    const allLocked = actChapters.every(ch => (ch.chapter+chOffset) > this.lastCompletedChapterIndex + 1);

    if (allCompleted) return 'all-completed';
    if (allLocked) return 'all-locked';
    return 'mixed';
  }

  startStoryFight(chapter: any) {
    let adjChapter: GameOverrides = {
      playerdeck: chapter.playerdeck,
      opponentdeck: chapter.opponentdeck,
      firstPlayer: chapter.firstPlayer,
      cards: chapter.cards,
      mulligan: chapter.mulligan,
      runes: chapter.runes,
      health: chapter.health,
      forcedDraw: chapter.forcedDraw,
      lanes: chapter.lanes,
      board: chapter.board,
      support: chapter.support,
      playerBoard: chapter.playerBoard,
      playerSupport: chapter.playerSupport
    }
    if (this.hardMode) {
      adjChapter.cards = undefined;
      adjChapter.firstPlayer = undefined;
      adjChapter.mulligan = undefined;
      adjChapter.playerdeck = undefined;
      adjChapter.runes = undefined;
      adjChapter.health = undefined;
      this.callStartGame(adjChapter);
    } else {
      this.callStartGame(adjChapter);      
    }
  }

  playStoryHints(chapterNumber: number) {
    const hints = this.storyHints[chapterNumber - 1];
    if (!hints || hints.length === 0) return;

    hints.forEach((hint, index) => {
      setTimeout(() => {
        this.showTemporaryHint(hint, 5000);
      }, index * 7500); // every 10 seconds
    });
  }

  updateBackgroundMusic() {
    if (!this.musicPlayer) {
      console.log('not found music player');
      return;
    } else if (!this.musicPlayer.nativeElement) {
      console.log('not found element');
      return;
    }

    let newUrl: string | null = null;
    //console.log('update music');
    if (this.isMainMenu) {
      //console.log('menu music');
      newUrl = this.getRandomMenuMusic();
    } else if (this.game.gameRunning) {
      //console.log('battle music');
      newUrl = this.getRandomBattleMusic();
    } else {
      newUrl = this.getRandomAmbientMusic();
    }

    // Only change if different (prevents restart on every tick)
    if (newUrl !== this.currentMusicUrl) {
      this.currentMusicUrl = newUrl;

      if (newUrl) {
        this.musicPlayer.nativeElement.src = newUrl;
        //console.log(`playing ${newUrl}`);
        this.musicPlayer.nativeElement.currentTime = 0; // restart from beginning
        this.musicPlayer.nativeElement.play().catch(err => {
          console.warn('Music autoplay blocked:', err);
        });
      } else {
        //console.log(`stopping music`);
        this.musicPlayer.nativeElement.pause();
        this.musicPlayer.nativeElement.src = '';
      }
    }
  }

  // Pick random track
  private getRandomMenuMusic(): string {
    const menuTracks = [
      '/assets/tesl/audio/music/The_Elder_Scrolls_Legends_Menu_01_v1.mp3',
      '/assets/tesl/audio/music/The_Elder_Scrolls_Legends_Menu_02_v1.mp3',
      // add all your %_Menu_% files here
    ];
    return menuTracks[Math.floor(Math.random() * menuTracks.length)];
  }

  private getRandomBattleMusic(): string {
    const battleTracks = [
      '/assets/tesl/audio/music/The_Elder_Scrolls_Legends_Battle_01_v1.mp3',
      '/assets/tesl/audio/music/The_Elder_Scrolls_Legends_Battle_02_v1.mp3',
      // add all your %_Battle_% files
    ];
    return battleTracks[Math.floor(Math.random() * battleTracks.length)];
  }

  private getRandomAmbientMusic(): string {
    const battleTracks = [
      '/assets/tesl/audio/music/Cardinal_General_Pregame_Ambience.mp3',
      // add all your %_Battle_% files
    ];
    return battleTracks[Math.floor(Math.random() * battleTracks.length)];
  }

  private getVictoryMusic(): string {
    return '/assets/tesl/audio/music/Cardinal_General_Gameplay_Fanfare_Win.mp3';
  }

  private getDefeatMusic(): string {
    return '/assets/tesl/audio/music/Cardinal_General_Gameplay_Fanfare_Lose.mp3';
  }

  // Optional: change track when song ends
  onMusicEnded() {
    if (this.isMainMenu) {
      this.musicPlayer.nativeElement.src = this.getRandomMenuMusic();
    } else if (this.game?.gameRunning) {
      this.musicPlayer.nativeElement.src = this.getRandomBattleMusic();
    } else {
      this.musicPlayer.nativeElement.src = this.getRandomAmbientMusic();
    }
    this.musicPlayer.nativeElement.play().catch(() => {});
  }

  playMusic(url: string) {
    this.musicPlayer.nativeElement.src = url;
    this.musicPlayer.nativeElement.play().catch(() => {});
  }

  playVideo(videoUrl: string, type: 'start' | 'end' = 'start') {
    const videoEl = document.querySelector('video');
    if (videoEl) {
      videoEl.pause();
      videoEl.src = '';           // clear source
      videoEl.load();             // force reload
    }
    this.currentVideo = videoUrl;
    this.currentVideoJustPlayed = type;

    // Mute music
    if (this.musicPlayer?.nativeElement) {
      this.musicPlayer.nativeElement.volume = 0;
    }

    // Small delay to ensure video element is ready
    setTimeout(() => {
      const newVideoEl = document.querySelector('video') as HTMLVideoElement | null;
      if (newVideoEl && videoUrl) {
        newVideoEl.src = videoUrl;
        newVideoEl.load();

        // Mute video if global sound is off
        newVideoEl.muted = !this.audioEnabled;

        newVideoEl.play().catch(err => {
          console.warn('Video autoplay failed:', err);
        });
      }
    }, 100);

    console.log(`Playing ${type} video: ${videoUrl} (muted: ${!this.audioEnabled})`);
  }

  updateMusicVolume() {
    if (this.audioEnabled) {
      this.musicVolume =  0.25;
    } else {
      this.musicVolume = 0;
    }
    if (this.musicPlayer?.nativeElement) {
      this.musicPlayer.nativeElement.volume = this.musicVolume;
    }
  }

  toggleDesktopMode() {
    this.isDesktopMode = !this.isDesktopMode;
    // optional: save to localStorage if you want persistence
    localStorage.setItem('tesl-layout', this.isDesktopMode ? 'desktop' : 'mobile');
  }

  // Menu actionsconsole.log('Chapters loaded:', this.storyChapters.length);
  startExhibition() {
    this.isExhibitionMode = true
    this.isMainMenu = false;
    this.showGameBoard = true;
    // Start exhibition mode (custom game, no opponent, etc.)
  }

  openCollection() {
    this.dialog.open(CollectionViewerComponent, {
      width: '100vw',
      maxWidth: '1400px',
      height: '100vh',
      //height: '100%',
     // maxHeight: '95vh',
      panelClass: 'collection-dialog', // for custom styling
      disableClose: false,
      autoFocus: false,
      data: {
        unlockedCardIds: Array.from(this.unlockedCards),   // your global unlocked set
        unlockAll: this.unlockedAll
      }
    });
  }

  openDeckBuilder() {
    const dialogRef = this.dialog.open(DeckBuilderComponent, {
      width: '100%',
      maxWidth: '1440px',
      height: '100%',
      //maxHeight: '95vh',
      panelClass: 'deck-dialog',
      disableClose: false,
      autoFocus: false,
      data: {
        unlockedCardIds: Array.from(this.unlockedCards),   // your global unlocked set
        unlockAll: this.unlockedAll
      }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result && result.savedDecks) {
        // Update local state if needed
        this.savedDecks = result.savedDecks;  // optional: mirror in parent
        this.customDecks = this.savedDecks.map(d => this.mapToDeckOption(d,'custom'));
        this.unlockCustomDecks();
        console.log('Updated saved decks from dialog:', result.savedDecks.length);
        
        // Optional: refresh UI, show toast, etc.
      }
    });
  }

  openRanked() {
    this.isRankedMode = true;

    const dialogRef = this.dialog.open(RankedComponent, {
      width: '100%',
      maxWidth: '1440px',
      height: '100%',
      panelClass: 'ranked-dialog',
      disableClose: true,
      autoFocus: false,
      data: {
        currentDeck: this.selectedPlayerDeck,
        starterDecks: this.starterDecks.filter(d => !d.locked || this.unlockedAll) || [],   // your existing starter decks
        customDecks: this.customDecks.filter(d => !d.locked || this.unlockedAll) || [],      // your existing custom decks
        triple: this.tripleRewards
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      this.isRankedMode = false;
      console.log('result:' , result);
      if (!result || result.cancelled) {
        this.backToMenu();
        return;
      }

      if (result.mode === 'ranked' && result.playerDeck 
          && result.tier !== undefined && result.stars !== undefined) {
        // Start the ranked match
        this.selectedPlayerDeck = result.playerDeck;
        this.playerDeckMode = this.selectedPlayerDeck!.source;
        const serialized = JSON.stringify(this.selectedPlayerDeck);
        localStorage.setItem('exhibition_player_deck', serialized);
        console.log('Saved player deck:', this.selectedPlayerDeck!.name);
        this.startRankedMatch(result.tier, result.stars);
      }
    });
  }

  // ====================== RANKED MATCH START ======================
startRankedMatch(tier: number, stars: number) {
  // Determine opponent deck based on current player rank
  const opponentDeck = this.getRankedOpponentDeck(tier, stars);
  if (!opponentDeck) {
    console.error('Could not find a suitable opponent deck for ranked');
    return;
  }
  console.log(`Ranked opponent chosen: ${opponentDeck.name} (tier ${opponentDeck.tier})`);

  // Store for UI / game
  this.selectedOpponentDeck = opponentDeck;
  this.opponentDeckMode = opponentDeck.source;
  const serialized = JSON.stringify(opponentDeck);
  localStorage.setItem('exhibition_opponent_deck', serialized);
  this.isRankedMode = true;
  // Start the actual game (same pattern as arena)
  let overrides: GameOverrides = {};
  if (tier === 5) { //legendary
    overrides.maxMagicka = 2;
    overrides.oppCards = 3;
  } else if (tier === 4) { //diamond
    overrides.maxMagicka = 1;
    overrides.oppCards = 2;
  } else if (tier === 3) {  //platinum
    overrides.oppCards = 1;
  }
  this.callStartGame(overrides);
}

// ====================== OPPONENT TIER SELECTION ======================
private getRankedOpponentDeck(tier: number, stars: number): DeckOption | null{
    const allDecks = [...(this.npcDecks || []), ...(this.starterDecks || [])]
      .filter(d => d && d.tier && d.tier >= 1 && d.tier <= 6);

    if (allDecks.length === 0) return null;

    const playerTier = tier;
    const playerStars = stars;

    let targetTiers: number[] = [];

    // Legendary (tier 5) always faces the best decks
    if (playerTier === 5) {
      targetTiers = [1];
    }
    // Bronze with 0 stars always faces the weakest decks
    else if (playerTier === 0 && playerStars === 0) {
      targetTiers = [6];
    }
    // All other ranks: mix of 2 tiers with probability
    else {
      // Base opponent tier (higher player tier = harder opponent)
      const baseTier = Math.max(1, 6 - playerTier); // Bronze(0)→6, Silver(1)→5, ..., Diamond(4)→3

      // Add a small random shift based on stars
      const shift = playerStars >= 3 ? -1 : 1;

      const tier1 = Math.max(1, Math.min(6, baseTier + shift));
      const tier2 = Math.max(1, Math.min(6, baseTier));

      targetTiers = [tier1, tier2];
    }

    console.log(`Player tier ${playerTier} with ${playerStars} stars → target opponent tiers: ${targetTiers.join(', ')}`);

    // Filter decks that match one of the target tiers
    const candidateDecks = allDecks.filter(d => targetTiers.includes(d.tier!));

    if (candidateDecks.length === 0) {
      // Fallback: return any deck
      return this.utilityService.random(allDecks);
    }

    // Pick randomly from the candidates
    return this.utilityService.random(candidateDecks);
  }

  openSoloArena() {
    this.isArenaMode = true;
    const dialogRef = this.dialog.open(ArenaDraftComponent, {
      width: '100%',
      maxWidth: '1440px',
      height: '100%',
      panelClass: 'arena-dialog',
      disableClose: false,
      autoFocus: false,
      data: {
        arenaDecks: this.arenaOpponents,
        arenaScenarios: this.arenaScenarios,
        arenaElo: this.arenaElo,
        triple: this.tripleRewards
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      this.loadUnlockedCards();
      this.loadArenaState();

      const arenaElo = localStorage.getItem('TESL_arena_elo');
      if (arenaElo !== null) {
        this.arenaElo = parseInt(arenaElo,10);
      }
      if (!result || result.cancelled) {
        this.backToMenu();
        return;
      }

      if (result?.mode === 'arena') {
        this.isArenaMode = true;
        this.startArenaMatch(result.opponent, result.playerDeck);
      }
    });
  }

  startArenaMatch(opponent: ArenaOpponent, deck: Card[]) {
    if (!this.cpuTogglePlaying) {
      this.cpuTogglePlaying = true;
      this.saveCPUtoggle();
    }
    let overrides: GameOverrides = {};
    if (opponent.scenario) {
      const scen = opponent.scenario;
      console.log('arena scenario:', scen);
      if (scen.board) overrides.board = scen.board;
      if (scen.playerBoard) overrides.playerBoard = scen.playerBoard;
      if (scen.support) overrides.support = scen.support;
      if (scen.playerSupport) overrides.playerSupport = scen.support;
      if (scen.special) overrides.special = scen.special;
      if (scen.playerHand) overrides.playerHand = scen.playerHand;
      if (scen.maxMagicka) overrides.maxMagicka = scen.maxMagicka;
      if (scen.playerMaxMagicka) overrides.playerMaxMagicka = scen.playerMaxMagicka;
    }
    const arenaOpp = this.arenaOpponents.find(a => a.name === opponent.name);
    if (!arenaOpp) {
      console.log(`did not find arena opponent: ${opponent.name}`);
      overrides.deckCode = opponent.deckCode;
    } else {
      this.selectedOpponentDeck = arenaOpp;
      this.selectedOpponentDeckSource = 'arena';
      const serialized = JSON.stringify(arenaOpp);
      localStorage.setItem('exhibition_opponent_deck', serialized);
      console.log('Saved opponent deck:', arenaOpp.name);
    }
    overrides.playerdeck = [];
    deck.forEach(entry => {
      overrides.playerdeck!.push(entry.id);
    });
    this.callStartGame(overrides);
  }

  loadArenaState() {
    const saved = localStorage.getItem(this.ARENA_STATE_KEY);
    if (saved) {
      this.arenaState = JSON.parse(saved);
      //this.arenaWins = this.arenaState.wins || 0;
      //this.arenaLosses = this.arenaState.losses || 0;
    } else {
      this.resetArenaState();
    }
  }

  saveArenaState() {
    if (this.arenaState) {
      //this.arenaState.wins = this.arenaWins;
      //this.arenaState.losses = this.arenaLosses;
      localStorage.setItem(this.ARENA_STATE_KEY, JSON.stringify(this.arenaState));
    }
  }

  resetArenaState() {
    this.arenaState = {
      selectedClass: null,
      classOptions: [],
      draftDeck: [],
      currentPicks: [],
      picksRemaining: 30,
      wins: 0,
      losses: 0,
      arenaOpponents: [],
      bossOpponent: null
    };
    localStorage.setItem(this.ARENA_STATE_KEY, JSON.stringify(this.arenaState));
  }

  showLaneHelp(lane: number) {
    const laneName = this.game.laneTypes[lane];
    this.lanes.forEach(l => {
      if (l.name === laneName) {
        this.showTemporaryHint(l.description);
      }
    });
    
  }

  deckValid(): boolean {
       // console.log('a');
    if (!this.selectedPlayerDeck || !this.playerDeckMode) return false;
    const deck = this.selectedPlayerDeck;
    const source = this.playerDeckMode;
    if (this.isStoryMode) {
        //console.log('b');
      if (source === 'starter') {
        //console.log('c');
        const currDeck = this.starterDecks.find(s => s.name === deck.name);
        if (!currDeck) return false;
        if (this.unlockedAll) return true;
        if (currDeck.locked) return false;
      } else if (source === 'custom') {
        //console.log('1');
        const currDeck = this.customDecks.find(s => s.name === deck.name);
        if (this.unlockedAll) return true;
        //console.log('2');
        if (!currDeck) return false;
        //console.log('3');
        if (!currDeck.deckCode) return false;
        const deckInfo = this.deckService.decodeDeckCode(currDeck.deckCode);
        if (!deckInfo) return false;
        //console.log('4');
        let allUnlocked = true;
        deckInfo.forEach(c => {
          if (c.card.deckCodeId && !this.unlockedCards.includes(c.card.deckCodeId)) {
            console.log(`${c.card.name} is not unlocked`);
            allUnlocked = false;
          }
        });
        return allUnlocked;
      } else {
        return false;
      }
    }
    return true;
  }

  submitCheat() {
    const code = this.cheatCodeInput.trim().toLowerCase().replace(/\s/g, '');

    // Example cheat handling
    if (code === 'showmethemoney') {
      this.activateCheat('Triple Rewards');
    } else if (code === 'thereisnocowlevel') {
      this.activateCheat('Unlock All Cards');
    } else if (code === 'tooktheredpill') {
      this.activateCheat('Hand Reveal')
    } else if (code === 'poweroverwhelming') {
      this.activateCheat('Magicka Boost')
    } else {
      console.log('Invalid cheat code');
      this.cheatFailCount++;
      if (this.cheatFailCount >= 10) {
        this.cheatFailCount = 0;
        this.activateCheat('At Least I Have Chicken');
      }
    }
    this.cheatCodeInput = '';
  }

  activateCheat(reward: string) {
    this.cheatsActive = true;
    this.activeCheat = reward;
    localStorage.setItem('tesl_cheat',reward);
    console.log(`Cheat activated: ${reward}`);
  }

  revertCheats() {
    this.cheatsActive = false;
    this.activeCheat = 'None';
    localStorage.setItem('tesl_cheat',this.activeCheat);
    console.log('Cheats reverted');
    this.showTemporaryHint('Cheats reverted');
  }

  get unlockedAll(): boolean {
    return this.cheatsActive && this.activeCheat === 'Unlock All Cards';
  }

  get magickaBoost(): boolean {
    return this.cheatsActive && this.activeCheat === 'Magicka Boost';
  }

  get handReveal(): boolean {
    return this.cheatsActive && this.activeCheat === 'Hand Reveal';
  }

  get tripleRewards(): boolean {
    return this.cheatsActive && this.activeCheat === 'Triple Rewards';
  }

  get hasChicken(): boolean {
    return this.cheatsActive && this.activeCheat === 'At Least I Have Chicken';
  }

  importProgress() {
    this.utilityService.importProgressFromClipboard();
  }

  exportProgress() {
    this.utilityService.exportProgressToClipboard();
  }

  quitGame() {
    this.quitTESL();
    /*// Exit game or close window
    if (confirm('Quit game?')) {
      window.close();  // or redirect to login/home
    }*/
  }

  backToMenu() {
    if (this.game.gameRunning) {
      this.concede();
    } else {
      this.showSettingsOverlay = false;
      this.isMainMenu = true;
      this.isStoryMode = false;
      this.isArenaMode = false;
      this.isExhibitionMode = false;
      this.showGameBoard = false;
      this.updateBackgroundMusic();
    }
  }

  quitTESL() {
    //this.router.navigate(['/'], { replaceUrl: true });
    window.location.href = '/';
  }

}
