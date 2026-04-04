import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, Inject, APP_BOOTSTRAP_LISTENER } from '@angular/core';
import { Card, DeckEntry, DeckOption, DeckService } from '../tesl/deck.service'; // adjust path
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UtilityService } from '../tesl/utility.service';

export interface ArenaOpponent {
  name: string;
  avatar: string;
  deckCode: string;
  elo: number;
  scenario?: any;           // from your scenarios array
  isBoss?: boolean;
  beaten?: boolean;
}

interface ArenaClass {
	name: string;
	avatar: string;
	attributes: string[];
	race: string;
}

interface ArenaSaveState {
  selectedClass: any | null;
	avatarNumber: number;
	classOptions: ArenaClass[];
  draftDeck: Card[];
	currentPicks: Card[];
  picksRemaining: number;
  wins: number;
  losses: number;
  arenaOpponents: ArenaOpponent[];
  bossOpponent: ArenaOpponent | null;
  rewardSets: Card[][];
  rewardIndex: number;
}

@Component({
  selector: 'app-arena-draft',
  templateUrl: './arena-draft.component.html',
  styleUrls: ['./arena-draft.component.scss']
})
export class ArenaDraftComponent implements OnInit, AfterViewInit {
	@ViewChild('firstFocusable') firstFocusable!: ElementRef;
	
	attributeIcons: Record<string, string> = {
    'R': '/assets/tesl/images/icons/LG-icon-Strength.png',
    'B': '/assets/tesl/images/icons/LG-icon-Intelligence.png',
    'Y': '/assets/tesl/images/icons/LG-icon-Willpower.png',
    'G': '/assets/tesl/images/icons/LG-icon-Agility.png',
    'P': '/assets/tesl/images/icons/LG-icon-Endurance.png',
    'N': '/assets/tesl/images/icons/LG-icon-Neutral.png',
    'Dual': '/assets/tesl/images/icons/LG-icon-Dual_Attribute-small.png'
  };

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

	private setFolders: Record<string, string> = {
    'Core Set': 'core_set',
    'Dark Brotherhood': 'brotherhood',
    'Heroes of Skyrim': 'heroes_of_skyrim',
    'Madhouse Collection': 'madhouse',
    'Monthly Reward': 'reward_set',
    'Story Set': 'story_set',
    'Custom Set': 'custom_set'
  };

	readonly slotParameters = [ 
		{roll1: 0.05, value1: 'ProPlayer', roll2: 0.05, value2: 'ProBoth', minVar: -500, maxVar: -300}, 
		{roll1: 0.05, value1: 'ProPlayer', roll2: 0.05, value2: 'ProBoth', minVar: -500, maxVar: -300}, 
		{roll1: 0.5, value1: 'ProPlayer', roll2: 0.5, value2: 'None', minVar: -300, maxVar: -100},
		{roll1: 0.5, value1: 'ProBoth', roll2: 0.5, value2: 'None', minVar: -300, maxVar: -100},
		{roll1: 0.5, value1: 'ProAiMinor', roll2: 0.5, value2: 'None', minVar: -300, maxVar: -100},
		{roll1: 0.5, value1: 'ProAiMajor', roll2: 0.5, value2: 'None', minVar: -300, maxVar: -100},
		{roll1: 0.25, value1: 'ProAiMajor', roll2: 0.25, value2: 'ProAiMinor', minVar: -100, maxVar: 100},
		{roll1: 0.25, value1: 'ProAiMajor', roll2: 0.25, value2: 'ProAiMinor', minVar: -100, maxVar: 100},
		{roll1: 0, value1: 'None', roll2: 0, value2: 'None', minVar: -100, maxVar: 100} 
	];

  unlockedCards: string[] = [];           // card IDs that are unlocked
  arenaRewardSets: Card[][] = [];         // 4 sets of 3 cards each
  currentRewardIndex: number = -1;        // which reward set user is picking from
  tripleRewards: boolean = false;

  activeTab: 'curve' | 'stats' | 'deck' = 'curve';
  arenaScenarios: any[] = [];
	arenaDecks: DeckOption[] = [];
	arenaClass: string | null = null;
	arenaClassCards: Card[] = [];
	arenaElo: number = 1200;
	classOptions: ArenaClass[] = [];
  // Class selection
  selectedClass: any = null;
  avatarUrl: string = '';
	avatarNum: number = 1;

  // Drafting
  draftDeck: Card[] = [];
  draftDeckList: DeckEntry[] = [];       // deck being built
  picksRemaining = 30;
  currentPicks: Card[] = [];

  // Stats
  manaCurve: number[] = Array(8).fill(0); // 0-7+
	maxManaCurve: number = 5;
  typeCounts: { [key: string]: number } = { Creature: 0, Action: 0, Item: 0, Support: 0, Prophecy: 0 };
  attributeCounts: { [key: string]: number } = {};

  // Opponents
  arenaOpponents: ArenaOpponent[] = [];
  bossOpponent: ArenaOpponent | null = null;
  wins = 0;
  losses = 0;
  customSets: boolean = true;

  private readonly CUSTOM_SETS = 'TESL_CustomSets';
	private readonly STORAGE_KEY = 'arena_draft_state';
  private readonly LAST_REWARD_KEY = 'arena_last_reward_date';
  private readonly LAST_ELO_REWARD = 'arena_last_elo_reward';
  private readonly MAX_BANK_DAYS = 14;

  constructor(public dialogRef: MatDialogRef<ArenaDraftComponent>,
    private utilityService: UtilityService,
		private deckService: DeckService,
		@Inject(MAT_DIALOG_DATA) public data: any
  ) {
		this.arenaDecks = data?.arenaDecks || [];
		this.arenaScenarios = data?.arenaScenarios || [];
		this.arenaElo = data?.arenaElo ?? 1200;
    this.tripleRewards = data?.triple ?? false;
	}

  ngOnInit() {
    const storedCustomToggle = localStorage.getItem(this.CUSTOM_SETS);
    if (storedCustomToggle !== null) {
      this.customSets = storedCustomToggle === 'true';
    }
		this.loadSavedState();
    this.loadUnlockedCards();
    this.recalcStats();
		if (this.classOptions.length === 0) {
			this.getThreeClasses();
		} else if (this.wins >= 9 || this.losses >= 3) {
      this.handleRewards();      
    }
  }

  ngAfterViewInit() {
      this.firstFocusable?.nativeElement.focus();
  }

  get showArenaRewards(): boolean {
    return (this.arenaRewardSets.length > 0 && this.currentRewardIndex < this.arenaRewardSets.length);
  }

	private saveState() {
    const state: ArenaSaveState = {
      selectedClass: this.selectedClass,
			avatarNumber: this.avatarNum,
			classOptions: this.classOptions,
      draftDeck: this.draftDeck,
			currentPicks: this.currentPicks,
      picksRemaining: this.picksRemaining,
      wins: this.wins,
      losses: this.losses,
      arenaOpponents: this.arenaOpponents,
      bossOpponent: this.bossOpponent,
      rewardSets: this.arenaRewardSets,
      rewardIndex: this.currentRewardIndex
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  }

  private loadSavedState() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (!saved) return;

    try {
      const state: ArenaSaveState = JSON.parse(saved);
      console.log(state);
      this.selectedClass = state.selectedClass;
			this.classOptions = state.classOptions || [];
			this.avatarNum = state.avatarNumber ?? 1;
      this.draftDeck = state.draftDeck || [];
			this.currentPicks = state.currentPicks || [];
      this.picksRemaining = state.picksRemaining ?? 30;
      this.wins = state.wins ?? 0;
      this.losses = state.losses ?? 0;
      this.arenaOpponents = state.arenaOpponents || [];
      this.bossOpponent = state.bossOpponent;
      this.arenaRewardSets = state.rewardSets || [];
      this.currentRewardIndex = state.rewardIndex ?? -1;

      //console.log('draft deck is ...',this.draftDeck);

      if (this.selectedClass) {
        this.selectArenaClass(this.selectedClass.name);
        this.avatarUrl = `/assets/tesl/images/avatars/LG-avatar-${this.selectedClass.race}_${state.avatarNumber}.png`;
      }

      // If draft was in progress, regenerate current picks if needed
      if (this.picksRemaining > 0 && this.currentPicks.length === 0) {
        this.generateNextPicks();
      }

      this.draftDeck.forEach(c => {
        this.addCardToList(c);
      });
    } catch (e) {
      console.warn('Failed to load arena draft state', e);
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  private clearSavedState() {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  getAttributeClass(attr: string[]): string {
    if (!attr) return 'attr-neutral';
    if (attr.length > 1) return 'attr-multi';

    switch (attr[0]) {
        case 'R': return 'attr-red';
        case 'Y': return 'attr-yellow';
        case 'B': return 'attr-blue';
        case 'P': return 'attr-purple';
        case 'G': return 'attr-green';
        case 'N': return 'attr-neutral';
        default: return 'attr-neutral';
    }
  }

  getRarityClass(rarity: string): string {
    switch (rarity.substring(0,1)) {
        case '1': return 'rarity-common';
        case '2': return 'rarity-rare';
        case '3': return 'rarity-epic';
        case '4': return 'rarity-legendary';
        default: return 'rarity-common';
    }
  }

  nextTab() {
    if (this.activeTab === 'curve') {
      this.activeTab = 'stats';
    } else if (this.activeTab === 'stats') {
      this.activeTab = 'deck';
    } else {
      this.activeTab = 'curve';
    }
  }

  grantArenaRewards(wins: number) {
    this.arenaRewardSets = [];
    this.currentRewardIndex = 0;

    const allCards = this.deckService.getAllCards().filter(c => 
      c.deckCodeId && c.set !== 'Story Set' && !this.unlockedCards.includes(c.deckCodeId) &&
      (this.customSets || c.set !== 'Custom Set')
    );

    const draftAttrs = this.selectedClass.attributes; // we'll define this

    const usedIds = new Set<string>();

    const milestones = [0, 3, 6, 9];

    // Check for daily double reward
    const todayStr = this.getCurrentDateYYYYMMDD();
    console.log(`today is ${todayStr}`);
    let lastRewardStr = localStorage.getItem(this.LAST_REWARD_KEY);
    console.log(`last reward date is ${lastRewardStr}`);

    let daysSinceLastReward = 0;

    if (lastRewardStr) {
      daysSinceLastReward = this.getDaysBetween(lastRewardStr, todayStr);
      console.log(`days since last reward is ${daysSinceLastReward}`);
    }

    let isDoubleDay = false;

    if (!lastRewardStr || lastRewardStr !== todayStr) {
      isDoubleDay = true;
      // Update last reward date
      if (daysSinceLastReward > 1) {
        const bankedDays = Math.min(daysSinceLastReward, this.MAX_BANK_DAYS-1);

        // Move last reward date forward so remaining bank is preserved
        const newLastReward = this.addDays(todayStr, -bankedDays+1);

        localStorage.setItem(this.LAST_REWARD_KEY, newLastReward);
        console.log(`setting reward key to ${newLastReward}`);
      } else {
        console.log(`setting reward key to ${todayStr}`);
        localStorage.setItem(this.LAST_REWARD_KEY, todayStr);
      }
    }
    let numLoops = 1;
    if (this.tripleRewards) numLoops *= 3;
    if (isDoubleDay) numLoops *= 2;
    for (let i = 0; i < numLoops; i++) {
      for (const milestone of milestones) {
        if (wins >= milestone) {
          const rewardSet = this.generateRewardSet(milestone, allCards, draftAttrs, usedIds);
          this.arenaRewardSets.push(rewardSet);
        }
      }
    }

    const lastEloAward = localStorage.getItem(this.LAST_ELO_REWARD);
    let lastElo = 1200;
    if (lastEloAward) lastElo = parseInt(lastEloAward,10);
    if (this.arenaElo >= (lastElo+50)) {
      localStorage.setItem(this.LAST_ELO_REWARD,(lastElo+50).toString());
      const numAwards = this.tripleRewards ? 3 : 1;
      for (let i = 0; i < numAwards; i++) {
        const rewardSet = this.generateRewardSet(0, allCards, draftAttrs, usedIds, true);
        this.arenaRewardSets.push(rewardSet);
        console.log('Arena Elo ', (lastElo+50).toString(), ' milestone reward: ',rewardSet);
      }
    }

    while (this.currentRewardIndex < this.arenaRewardSets.length && 
      this.arenaRewardSets[this.currentRewardIndex].length === 0) {
        console.log(`no available rewards for index ${this.currentRewardIndex}. go next`);
        this.currentRewardIndex++;
    }

    this.saveState();
  }

  // Helper to get current date as YYYYMMDD
  private getCurrentDateYYYYMMDD(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private getDaysBetween(date1: string, date2: string): number {
    const d1 = new Date(
      parseInt(date1.substring(0,4)),
      parseInt(date1.substring(4,6)) - 1,
      parseInt(date1.substring(6,8))
    );
    const d2 = new Date(
      parseInt(date2.substring(0,4)),
      parseInt(date2.substring(4,6)) - 1,
      parseInt(date2.substring(6,8))
    );

    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // days
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(
      parseInt(dateStr.substring(0, 4)),
      parseInt(dateStr.substring(4, 6)) - 1,
      parseInt(dateStr.substring(6, 8))
    );

    d.setDate(d.getDate() + days);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}${month}${day}`;
  }

  private generateRarityPools(wins: number): Record<string, number> {
    if (wins === 0) {
      return {
        '4Legendary': 0.0232,
        '3Epic': 0.1036,
        '2Rare': 0.2595,
        '1Common': 0.6137
      };
    } else if (wins === 3) {
      return {
        '4Legendary': 0.0928,
        '3Epic': 0.3108,
        '2Rare': 0.5190,
        '1Common': 0.0774
      };
    } else if (wins === 6) {
      return {
        '4Legendary': 0.1856,
        '3Epic': 0.6216,
        '2Rare': 0.1928,
        '1Common': 0.0
      };
    } else { // 9 wins
      return {
        '4Legendary': 0.5568,
        '3Epic': 0.4432,
        '2Rare': 0.0,
        '1Common': 0.0
      };
    }
  }

  private getEloAdjustmentFactor(): number {
    const elo = this.arenaElo;

    let factor = (elo - 700 - (elo > 1400 ? (elo - 1400) / 2 : 0)) / 700;

    return factor;
  }

  private generateRewardSet(wins: number, allCards: Card[], draftAttrs: string[], usedIds: Set<string>, legendary?: boolean): Card[] {
    const set: Card[] = [];
    const rarityOrder = ['1Common', '2Rare', '3Epic', '4Legendary'];
    const rarityChances = this.generateRarityPools(wins);

    const roll = Math.random();
    let selectedRarity = '1Common';
    if (legendary) {
      selectedRarity = '4Legendary';
    } else {
      let cumulative = 0;

      // Safely calculate rarity
      for (const [rarity, chance] of Object.entries(rarityChances)) {
        cumulative += chance as number;   // explicit cast
        if (roll <= cumulative) {
          selectedRarity = rarity;
          break;
        }
      }

      const factor = this.getEloAdjustmentFactor();

      // Skip upward bonus for 0-win rewards
      const allowUpgrade = !(wins === 0 && factor > 1);

      const roll2 = Math.random();

      let rarityIndex = rarityOrder.indexOf(selectedRarity);

      if (factor < 1) {
        // Chance to DOWNGRADE
        const downgradeChance = 1 - factor;

        if (roll2 < downgradeChance && rarityIndex > 0) {
          rarityIndex -= 1;
        }

      } else if (factor > 1 && allowUpgrade) {
        // Chance to UPGRADE
        const upgradeChance = factor - 1;

        if (roll2 < upgradeChance && rarityIndex < rarityOrder.length - 1) {
          rarityIndex += 1;
        }
      }

      selectedRarity = rarityOrder[rarityIndex];
    }

    let rarityIndex = rarityOrder.indexOf(selectedRarity);
    let candidates: Card[] = [];

    // Step DOWN until we find available cards
    while (rarityIndex >= 0) {
      candidates = allCards.filter(c => 
        c.rarity === rarityOrder[rarityIndex] && 
        !usedIds.has(c.id)
      );

      if (candidates.length > 0) {
        break;
      }

      rarityIndex--;
    }
    if (rarityIndex >= 0) {
      selectedRarity = rarityOrder[rarityIndex];
    } else {
      return []; // no cards available at all
    }

    for (let i = 0; i < 3; i++) {

      // Get candidates for this rarity
      candidates = candidates.filter(c => !usedIds.has(c.id));

      if (candidates.length === 0) break;

      let pool = candidates;

      // Prefer cards matching draft class attributes (60% chance)
      if (Math.random() < 0.6 && !legendary) {
        const matching = candidates.filter(card => 
          card.attributes.some(attr => draftAttrs.includes(attr))
        );
        if (matching.length > 0) {
          pool = matching;
        }
      }
      const chosen = this.utilityService.random(pool);
      set.push(chosen);
      usedIds.add(chosen.id);          
    }

    return set;
  }

  get oppHeader(): string {
    if (this.wins >= 9) return `Congratulations!`
    if (this.losses >= 3) return `Try again...`;
    return 'Choose Opponent';
  }

  pickReward(card: Card) {
    this.unlockedCards.push(card.deckCodeId!);
    this.saveUnlockedCards();
    this.currentRewardIndex++;
    while (this.currentRewardIndex < this.arenaRewardSets.length && 
      this.arenaRewardSets[this.currentRewardIndex].length === 0) {
        console.log(`no available rewards for index ${this.currentRewardIndex}. go next`);
        this.currentRewardIndex++;
    }
    this.saveState();
  }

  saveUnlockedCards() {
    localStorage.setItem('unlocked_cards', JSON.stringify(Array.from(this.unlockedCards)));
  }

  loadUnlockedCards() {
    const saved = localStorage.getItem('unlocked_cards');
    if (saved) {
      this.unlockedCards = JSON.parse(saved);
    }
  }


	startNewRun() {
		this.selectedClass = null;
    this.wins = 0;
    this.losses = 0;
    this.arenaRewardSets = [];
    this.currentRewardIndex = -1;
    this.draftDeckList = [];
    this.draftDeck = [];

		//localStorage.setItem('TESL_arena_wins','0');
		//localStorage.setItem('TESL_arena_losses','0');
		this.getThreeClasses();
	}

  // === CLASS SELECTION ===
  selectClass(cls: any) {
    this.selectedClass = cls;
		this.selectArenaClass(cls.name);
    // Random avatar (1-4)
    const num = Math.floor(Math.random() * 4) + 1;
    this.avatarUrl = `/assets/tesl/images/avatars/LG-avatar-${cls.race}_${num}.png`;
		this.avatarNum = num;
    this.startDraft();
		this.saveState();
  }

	getThreeClasses() {
		let candidates = this.classes;
		const pickOne = this.utilityService.random(candidates);
		candidates = candidates.filter(cls => cls.name !== pickOne.name);
		const pickTwo = this.utilityService.random(candidates);
		candidates = candidates.filter(cls => cls.name !== pickTwo.name);
		const pickThree = this.utilityService.random(candidates);
		this.classOptions = [];
		let avatarIndex = Math.floor(Math.random()*4)+1;
		let aClass: ArenaClass = {
			name: pickOne.name,
			attributes: pickOne.attributes,
			race: pickOne.race,
			avatar: `/assets/tesl/images/avatars/LG-avatar-${pickOne.race}_${avatarIndex}.png`
		};
		this.classOptions.push(aClass);
		avatarIndex = Math.floor(Math.random()*4)+1;
		aClass = {
			name: pickTwo.name,
			attributes: pickTwo.attributes,
			race: pickTwo.race,
			avatar: `/assets/tesl/images/avatars/LG-avatar-${pickTwo.race}_${avatarIndex}.png`
		};
		this.classOptions.push(aClass);
		avatarIndex = Math.floor(Math.random()*4)+1;
		aClass = {
			name: pickThree.name,
			attributes: pickThree.attributes,
			race: pickThree.race,
			avatar: `/assets/tesl/images/avatars/LG-avatar-${pickThree.race}_${avatarIndex}.png`
		};
		this.classOptions.push(aClass);
		this.saveState();
	}	

  // === DRAFTING ===
  startDraft() {
    this.draftDeck = [];
    this.picksRemaining = 30;
    this.currentPicks = [];
    this.manaCurve = Array(8).fill(0); // 0-7+
	  this.maxManaCurve = 5;
    this.typeCounts = { Creature: 0, Action: 0, Item: 0, Support: 0, Prophecy: 0 };
    this.attributeCounts = {};
    this.generateNextPicks();
  }

  generateNextPicks() {
    if (this.picksRemaining <= 0) {
      this.finishDraft();
      return;
    }

    this.currentPicks = this.getSetOfThree(); // your existing method
  }

  selectArenaClass(name: string) {
    this.arenaClass = name;
		console.log(`choosing class: ${name}`);
    const cardsArena = this.deckService.getAllCards().filter(c => c.tier && c.tier !== 'U');
    const classArena = this.classes.find(cls => cls.name === name);
		if (!classArena) {
      console.log('couldnt find class that matched name');
      return;
    }
    this.arenaClassCards = cardsArena.filter(c =>
    (c.attributes.length === 1 && ['N',...classArena.attributes].includes(c.attributes[0])) ||
    (c.attributes.length === 2 &&
      classArena.attributes[0] === c.attributes[0] && classArena.attributes[1] === c.attributes[1]));
  }

  getSetOfThree() {
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
    const pickTier = this.getTier(cardsRarity);
    let cardsBucket = cardsRarity.filter(c => c.tier === pickTier);
    const pickOne = this.utilityService.random(cardsBucket);
    //const pickOne = this.utilityService.random(cardsRarity);
    //let cardsBucket = cardsRarity.filter(c => c.tier === pickOne.tier);
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
    return [pickOne, pickTwo, pickThree]
  }

  getTier(cards: Card[]): string {
    const tierMap = new Map<string, any[]>();
    for (const card of cards) {
      if (!tierMap.has(card.tier!)) {
        tierMap.set(card.tier!, []);
      }
      tierMap.get(card.tier!)!.push(card);
    }
    let tierWeights = Array.from(tierMap.entries()).map(([tier, cards]) => ({
      tier,
      weight: cards.length
    }));
    const tierOrder = ['S', 'A', 'B', 'C', 'D', 'E'];
    let bias = 0;
    if (this.arenaElo > 1400) {
      bias = Math.min((this.arenaElo - 1400) / 1200, 1); // up to +0.5 at 2000
    } else if (this.arenaElo < 1400) {
      bias = -Math.min((1400 - this.arenaElo) / 1200, 1); // down to -0.5 at 800
    }
    tierWeights = tierWeights.map(t => {
      const index = tierOrder.indexOf(t.tier);
      const strength = 1 - (index / (tierOrder.length - 1)); 
      // S = 1, E = 0

      // Shift weight based on bias
      const adjusted = t.weight * (1 - bias * (strength - 0.5) * 2);

      return {
        tier: t.tier,
        weight: Math.max(0.01, adjusted) // prevent zero
      };
    });
    return this.weightedPick(tierWeights);
  }

  private weightedPick(weights: { tier: string, weight: number }[]) {
    const total = weights.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * total;

    for (const w of weights) {
      if (roll < w.weight) return w.tier;
      roll -= w.weight;
    }

    return weights[0].tier; // fallback
  }

  pickCard(card: Card) {
    this.draftDeck.push(card);
    this.addCardToList(card);
    this.updateStats(card);
    this.picksRemaining--;
    this.generateNextPicks();
		this.saveState();
  }

  addCardToList(card: Card) {
    const existing = this.draftDeckList.find(e => e.card.id === card.id);

    if (existing) {
      existing.count++;
    } else {
      this.draftDeckList.push({ card: {...card}, count: 1 });
    }

    // Sort deck by cost
    this.draftDeckList.sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0));
  }

	getCardImage(card: Card): string {
		return this.utilityService.getCardImageByName(card ? card.name : 'placeholder', card ? this.setFolders[card.set] : undefined);
	}

  recalcStats() {    
    this.draftDeck.forEach(c => {
      this.updateStats(c);
    });
  }

  updateStats(card: Card) {
		const newCurve = [...this.manaCurve];
    const cost = card.cost ?? 0;
		let index = cost;
		if (index > 7) index = 7;
    newCurve[index]++;
		if (newCurve[index] >= this.maxManaCurve) this.maxManaCurve = newCurve[index]+1;

		this.manaCurve = newCurve;

    this.typeCounts[card.type] = (this.typeCounts[card.type] || 0) + 1;

    if (card.prophecy) this.typeCounts['Prophecy']++;

    card.attributes.forEach(attr => {
      this.attributeCounts[attr] = (this.attributeCounts[attr] || 0) + 1;
    });
		//console.log(this.manaCurve);
  }

	trackByIndex(index: number): number {
		return index;
	}

  get currentDeckTotal() {
    return this.draftDeck.length;
  }

  finishDraft() {
    this.currentPicks = [];
    this.loadArenaOpponents(); // show opponents after draft
		this.saveState();
  }

	

	findSlotOpponent(slot: number, boss: boolean = false): ArenaOpponent {
		const roll = Math.random();
		let eloAdjust = 0;
		let arenaScenario = null;
		let arenaType = 'None';
		const param = this.slotParameters[slot];
		if (roll < param.roll1) {
			arenaType = param.value1;
		} else if (roll < (param.roll1 + param.roll2)) {
			arenaType = param.value2;
		}
		if (arenaType !== 'None') {
			const candidates = this.arenaScenarios.filter(a => a.type === arenaType);
			arenaScenario = this.utilityService.random(candidates);
			eloAdjust = arenaScenario.eloModifier;
		}

    // ELO-based magicka disadvantage scaling
    if (this.arenaElo > 1600) {
      const chance = Math.min(1, (this.arenaElo - 1600) / 400);
      if (Math.random() < chance) {
        console.log('Applying magicka disadvantage scenario due to high ELO:', this.arenaElo, ' for slot: ', slot);
        if (!arenaScenario) {
          // Create new scenario if none exists
          arenaScenario = {
            name: "Elo Magicka Disadvantage",
            description: "Your opponent gains a magicka advantage due to your high rank.",
            condition: "Opponent starts with extra max magicka.",
            type: "ProAiMinor",
            eloModifier: 0,
            maxMagicka: 1
          };
        } else {
          // Modify existing scenario (clone to avoid mutating base data)
          arenaScenario = { ...arenaScenario };
          if (arenaScenario.maxMagicka) {
            arenaScenario.maxMagicka += 1;
          } else {
            arenaScenario.maxMagicka = 1;
          }
        }
      }
    }

		console.log(arenaType, arenaScenario);
		let oppCandidates = this.arenaDecks.filter(d => 
			d.elo! >= (this.arenaElo-eloAdjust+param.minVar) && 
			d.elo! <= (this.arenaElo-eloAdjust+param.maxVar) && 
			!this.arenaOpponents.some(o=> o.name === d.name)
		);
		let chosen = this.utilityService.random(oppCandidates);
		let chosenOpp: ArenaOpponent = {
			name: chosen.name,
			avatar: "/assets/tesl/images/avatars/" + chosen.avatar,
			deckCode: chosen.deckCode!,
			elo: chosen.elo!,
			scenario: arenaScenario,
			isBoss: boss,
			beaten: false
		};
		console.log(chosenOpp);
		return chosenOpp;
	}

	getBarHeight(count: number): number {
		if (count <= 0) return 0;

		//const maxCount = Math.max(...this.manaCurve) + 1;
		return Math.round((count / this.maxManaCurve) * 100);
	}

	// Helper for Object.keys in template
	getAttributeKeys(): string[] {
		return Object.keys(this.attributeCounts);
	}

  // === OPPONENTS ===
  loadArenaOpponents() {
    this.arenaOpponents = [];
    // First 8 follow your table
		for (let i = 0; i < 8; i++) {
			this.arenaOpponents.push(this.findSlotOpponent(i));
		}
		this.arenaOpponents = this.utilityService.shuffle(this.arenaOpponents);
		this.bossOpponent = this.findSlotOpponent(8,true);

    const supportOptions = ['moonstone-relic','ebony-relic','malachite-relic','iron-relic','quicksilver-relic','corundum-relic'];
    const chosenOption = this.utilityService.random(supportOptions);
    //this.bossOpponent.scenario.support = [chosenOption];
    this.bossOpponent.scenario = {
        "name": `Boss - ${chosenOption}`,
        "description": `Boss starts with ${chosenOption} relic.`,
        "condition": `Boss starts with ${chosenOption} relic support in play`,
        "type": "ProAiMajor",
        "eloModifier": 0,
        "support": [chosenOption]
    };
		
  }

  retireRun() {
    this.losses = 3;
    this.arenaElo += 25*(this.wins-6);
    this.arenaElo = Math.min(2000,Math.max(800,this.arenaElo));
    localStorage.setItem('TESL_arena_elo', this.arenaElo.toString());
    this.handleRewards();
  }

  handleRewards() {
    if (this.arenaRewardSets.length === 0) {
      this.grantArenaRewards(this.wins);
    }
  }

  get rewardStatus(): string {
    const rewLen = this.arenaRewardSets.length;
    const rewInd = this.currentRewardIndex;
    if (rewLen > 0) {
      if (rewInd !== -1) {
        return `${rewInd+1}/${rewLen}`;
      } else {
        return `x/${rewLen}`;
      }
    } else {
      return '0/0';
    }
  }

  selectOpponent(opponent: ArenaOpponent) {
    if (this.wins > 8) {
      alert('Run has been complete');
      return;
    }
    if (this.losses > 2) {
      alert(`You've lost 3 times!`);
      return;
    }
    if (opponent.isBoss && this.wins < 8) {
      alert("Defeat 8 opponents to unlock the boss!");
      return;
    }
    if (opponent.beaten) {
      alert('Already beaten this opponent.');
      return;
    }
    // Start arena match with this opponent
    // You can close dialog and start game with scenario applied
    this.dialogRef.close({
      mode: 'arena',
      opponent: opponent,
      playerDeck: this.draftDeck
    });
  }

  // Close without playing
  close() {
    this.dialogRef.close({ cancelled: true });
  }
}