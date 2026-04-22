import { Component, OnInit, AfterViewInit, ViewChild, ElementRef, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Card } from '../tesl/deck.service';
import { UtilityService } from '../tesl/utility.service';
import { DeckService, DeckOption } from '../tesl/deck.service';

export interface RankTier {
  name: string;
  color: string;
  minElo?: number;
}

export interface RankedSaveState {
  currentTier: number;
  currentStars: number;
  lastRewardStars: { [key: string]: number[] }; // tierName -> [stars already rewarded]
  lastResetMonth: string; // YYYY-MM
  totalWins: number;
  totalLosses: number;
  rewardSets: Card[][];
  rewardIndex: number;
}

@Component({
    selector: 'app-ranked',
    templateUrl: './ranked.component.html',
    styleUrls: ['./ranked.component.scss'],
    standalone: false
})
export class RankedComponent implements OnInit, AfterViewInit {

  @ViewChild('firstFocusable') firstFocusable!: ElementRef;

  attributeIcons: Record<string, string> = {
    'R': '/assets/tesl/images/icons/LG-icon-Strength.webp',
    'B': '/assets/tesl/images/icons/LG-icon-Intelligence.webp',
    'Y': '/assets/tesl/images/icons/LG-icon-Willpower.webp',
    'G': '/assets/tesl/images/icons/LG-icon-Agility.webp',
    'P': '/assets/tesl/images/icons/LG-icon-Endurance.webp',
    'N': '/assets/tesl/images/icons/LG-icon-Neutral.webp',
    'Dual': '/assets/tesl/images/icons/LG-icon-Dual_Attribute-small.webp'
  };

  readonly tiers: RankTier[] = [
    { name: 'Bronze',   color: '#cd7f32' },
    { name: 'Silver',   color: '#c0c0c0' },
    { name: 'Gold',     color: '#ffd700' },
    { name: 'Platinum', color: '#b9f2ff' },
    { name: 'Diamond',  color: '#00bfff' },
    { name: 'Legendary',color: '#ff00ff' }
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

  expandedDeckList: boolean = false;

  currentTierIndex: number = 0;     // 0 = Bronze, 5 = Legendary
  currentStars: number = 0;         // 0-5 (Legendary ignores this)

  lastRewardStars: { [key: string]: number[] } = {}; // e.g. "Gold": [1,3,5]

  // Reward system (exactly like Arena)
  arenaRewardSets: Card[][] = [];
  currentRewardIndex = -1;

  totalWins = 0;
  totalLosses = 0;

  availableDecks: DeckOption[] = [];           // will contain both starter + custom decks
  selectedDeck: DeckOption | null = null;
  inputDeck: DeckOption | null = null;              // for pasting deck codes directly in ranked mode

  customSets: boolean = true;
  unlockedCards: string[] = [];           // card IDs that are unlocked
  tripleRewards: boolean = false;

  private readonly CUSTOM_SETS = 'TESL_CustomSets';
  private readonly STORAGE_KEY = 'tesl_ranked_state';
  private readonly LAST_RESET_KEY = 'tesl_ranked_last_reset';
  private readonly RANKED_RESULT_KEY = 'TESL_ranked_result';

  constructor(
    public dialogRef: MatDialogRef<RankedComponent>,
    private utilityService: UtilityService,
    private deckService: DeckService,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.tripleRewards = data?.triple ?? false;
    this.availableDecks = [...data?.starterDecks || [], ...data?.customDecks || []];
    this.inputDeck = data?.currentDeck || null;
  }

  ngOnInit() {
    this.checkMonthlyReset();
    this.loadRankedState();
    this.loadUnlockedCards();
    this.loadAvailableDecks();
    const storedCustomToggle = localStorage.getItem(this.CUSTOM_SETS);
    if (storedCustomToggle !== null) {
      this.customSets = storedCustomToggle === 'true';
    }
    // Check if we have a ranked result from the game
    const rankedResult = localStorage.getItem(this.RANKED_RESULT_KEY);
    if (rankedResult) {
      localStorage.removeItem(this.RANKED_RESULT_KEY);
      this.processMatchResult(rankedResult === 'win');
    }
  }

  ngAfterViewInit() {
    this.firstFocusable?.nativeElement.focus();
  }

  getCardImage(card: Card): string {
		return this.utilityService.getCardImageByName(card ? card.name : 'placeholder', card ? this.setFolders[card.set] : undefined);
	}

  toggleDeckSelector() {
    this.expandedDeckList = !this.expandedDeckList;
  }

  loadUnlockedCards() {
    const saved = localStorage.getItem('unlocked_cards');
    if (saved) {
      this.unlockedCards = JSON.parse(saved);
    }
  }

  saveUnlockedCards() {
    localStorage.setItem('unlocked_cards', JSON.stringify(Array.from(this.unlockedCards)));
  }

  private checkMonthlyReset() {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const lastReset = localStorage.getItem(this.LAST_RESET_KEY);
    console.log(`last reset: ${lastReset}, current month: ${currentMonth}`);
    if (!lastReset || lastReset !== currentMonth) {
      console.log('Performing monthly reset of ranked progress');
      this.resetRank();
      localStorage.setItem(this.LAST_RESET_KEY, currentMonth);
    }
  }

  get showRewards(): boolean {
    return (this.arenaRewardSets.length > 0 && this.currentRewardIndex < this.arenaRewardSets.length);
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

  private resetRank() {
    this.currentTierIndex = 0;   // Bronze
    this.currentStars = 0;
    this.lastRewardStars = {};
    this.totalWins = 0;
    this.totalLosses = 0;
    this.saveRankedState();
  }

  private saveRankedState() {
    const state: RankedSaveState = {
      currentTier: this.currentTierIndex,
      currentStars: this.currentStars,
      lastRewardStars: this.lastRewardStars,
      lastResetMonth: localStorage.getItem(this.LAST_RESET_KEY) || '',
      totalWins: this.totalWins,
      totalLosses: this.totalLosses,
      rewardSets: this.arenaRewardSets,
      rewardIndex: this.currentRewardIndex
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
  }

  private loadRankedState() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (!saved) return;

    try {
      const state: RankedSaveState = JSON.parse(saved);
      this.currentTierIndex = state.currentTier ?? 0;
      this.currentStars = state.currentStars ?? 0;
      this.lastRewardStars = state.lastRewardStars || {};
      this.totalWins = state.totalWins ?? 0;
      this.totalLosses = state.totalLosses ?? 0;
      this.arenaRewardSets = state.rewardSets ?? [];
      this.currentRewardIndex = state.rewardIndex ?? 0;
    } catch (e) {
      console.warn('Failed to load ranked state');
      this.resetRank();
    }
  }

  get currentTierName(): string {
    return this.tiers[this.currentTierIndex].name;
  }

  get isLegendary(): boolean {
    return this.currentTierIndex === 5;
  }

  // Called after a match ends
  processMatchResult(isWin: boolean) {
    if (isWin) {
      this.totalWins++;
      
      if (this.isLegendary) {
        this.grantLegendaryReward();
      } else {
        this.currentStars++;

        if (this.currentStars > 5) {
          this.currentStars = 1;
          this.currentTierIndex = Math.min(5, this.currentTierIndex + 1);
        }

        this.checkAndGrantStarReward();
      }
    } else {
      this.totalLosses++;
      if (!this.isLegendary && this.currentStars > 0) {
        this.currentStars--;
      }
    }

    this.saveRankedState();
  }

  private loadAvailableDecks() {
    // Concatenate starter decks + custom decks (from your existing logic)
    const starterDecks = this.data?.starterDecks || [];
    const customDecks = this.data?.customDecks || [];
    
    this.availableDecks = [...starterDecks, ...customDecks]
      .filter(deck => deck && (deck.cards?.length > 0 || deck.deckCode));

    // Auto-select first deck if available
    if (this.availableDecks.length > 0) {
      this.selectedDeck = this.availableDecks
        .find(d => d.source === this.inputDeck?.source && 
          d.name === this.inputDeck?.name) || this.availableDecks[0];
      //this.selectedDeck = this.availableDecks[0];
    }
  }

  // Add this method
  selectDeck(deck: any) {
    this.selectedDeck = deck;
    this.expandedDeckList = false;
  }

  // Add this to close() when starting match
  startRankedMatch() {
    if (!this.selectedDeck) return;

    this.dialogRef.close({
      mode: 'ranked',
      result: 'start',
      playerDeck: this.selectedDeck,
      tier: this.currentTierIndex,
      stars: this.currentStars
    });
  }

  private checkAndGrantStarReward() {
    const tierName = this.currentTierName;
    if (!this.lastRewardStars[tierName]) {
      this.lastRewardStars[tierName] = [];
    }

    const rewardedStars = this.lastRewardStars[tierName];

    // First time reaching this star in this tier
    if (!rewardedStars.includes(this.currentStars)) {
      rewardedStars.push(this.currentStars);
      this.grantRankedRewards();
    }
  }

  // ====================== REWARD GENERATION (exactly like Arena) ======================
  private grantRankedRewards() {
    const tierIndex = this.currentTierIndex;
    const star = this.currentStars;
    this.arenaRewardSets = [];
    this.currentRewardIndex = 0;

    const allCards = this.getEligibleCards();
    const usedIds = new Set<string>();
    let numSets = tierIndex >= 4 ? 2 : 1;   // Diamond+ gets 2 reward sets
    if (star === 1 && tierIndex > 0) numSets *= 3;
    if (this.tripleRewards) numSets *= 3;

    for (let i = 0; i < numSets; i++) {
      const set = this.generateRankedRewardSet(allCards, usedIds);
      this.arenaRewardSets.push(set);
    }

    while (this.currentRewardIndex < this.arenaRewardSets.length && 
      this.arenaRewardSets[this.currentRewardIndex].length === 0) {
        console.log(`no available rewards for index ${this.currentRewardIndex}. go next`);
        this.currentRewardIndex++;
    }

    this.saveRankedState();
  }

  private generateRankedRewardSet(allCards: Card[], usedIds: Set<string>): Card[] {
    const tierIndex = this.currentTierIndex;
    const set: Card[] = [];
    const rarityChances = this.getRarityChancesForTier(tierIndex);
    const rarityOrder = ['1Common', '2Rare', '3Epic', '4Legendary'];

    let roll = Math.random();
    let selectedRarity = '1Common';

    let cum = 0;
    for (const [rarity, chance] of Object.entries(rarityChances)) {
      cum += chance;
      if (roll <= cum) {
        selectedRarity = rarity;
        break;
      }
    }
    let candidates: Card[] = [];
    let rarityIndex = rarityOrder.indexOf(selectedRarity);
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
      candidates = candidates.filter(c => !usedIds.has(c.id));
      if (candidates.length === 0) break;
      const chosen = this.utilityService.random(candidates);
      set.push(chosen);
      usedIds.add(chosen.id);
    }
    return set;
  }

  private getRarityChancesForTier(tier: number) {
    if (tier === 5) return { '4Legendary': 0.25, '3Epic': 0.5, '2Rare': 0.25 };           // Legendary
    if (tier === 4) return { '4Legendary': 0.15, '3Epic': 0.35, '2Rare': 0.4, '1Common': 0.05 }; // Diamond
    if (tier === 3) return { '4Legendary': 0.05,'3Epic': 0.2, '2Rare': 0.4, '1Common': 0.35 }; // Platinum
    if (tier === 2) return { '4Legendary': 0.025, '3Epic': 0.1, '2Rare': 0.4, '1Common': 0.475 }; // Gold
    if (tier === 1) return { '4Legendary': 0.01, '3Epic': 0.05, '2Rare': 0.3, '1Common': 0.64 }; // Silver
    return { '2Rare': 0.2, '1Common': 0.8 }; // lower tiers
  }

  private getEligibleCards(): Card[] {
    /*return this.deckService.getAllCards().filter(c =>
      c.deckCodeId && c.set !== 'Story Set' && !this.unlockedCards.includes(c.deckCodeId) &&
      (this.customSets || c.set !== 'Custom Set')
    );*/
    return this.deckService.getMostCards().filter(c => 
      !this.unlockedCards.includes(c.deckCodeId!)
    );
  }

  private grantLegendaryReward() {
    const allCards = this.getEligibleCards();
    const usedIds = new Set<string>();
    this.arenaRewardSets = [this.generateRankedRewardSet(allCards, usedIds)];
    this.currentRewardIndex = 0;
    if (this.arenaRewardSets[0].length === 0) {
      console.log('no available rewards for legendary tier');
      this.arenaRewardSets = [];
      this.currentRewardIndex = -1;
    }
    this.saveRankedState();
  }

  // ====================== REWARD PICKING ======================
  pickReward(card: Card) {
    // Unlock the card
    // (You can expand this with your existing unlock logic)
    console.log(`Ranked reward picked: ${card.name}`);
    this.unlockedCards.push(card.deckCodeId!);
    this.saveUnlockedCards();
    this.currentRewardIndex++;
    while (this.currentRewardIndex < this.arenaRewardSets.length && 
      this.arenaRewardSets[this.currentRewardIndex].length === 0) {
        console.log(`no available rewards for index ${this.currentRewardIndex}. go next`);
        this.currentRewardIndex++;
    }
    if (this.currentRewardIndex >= this.arenaRewardSets.length) {
      this.arenaRewardSets = [];
      this.currentRewardIndex = -1;
    }
    this.saveRankedState();
  }

  close() {
    this.dialogRef.close();
  }
}