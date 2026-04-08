import { Component, Input, Output, OnInit, AfterViewInit, ElementRef, ViewChild, EventEmitter, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Card, DeckService } from '../tesl/deck.service';
import { UtilityService } from '../tesl/utility.service';

@Component({
  selector: 'app-collection',
  templateUrl: './collection.component.html',
  styleUrls: ['./collection.component.scss']
})
export class CollectionViewerComponent implements OnInit, AfterViewInit {
    @ViewChild('firstFocusable') firstFocusable!: ElementRef;
    
  @Input() showFilters: boolean = true;           // default true → hide in deck builder
  @Input() hideStorySet: boolean = false;         // deck builder passes true
  @Input() attributeWhitelist: string[] | null = null;  // deck builder passes allowed attrs
  @Input() enableOutput: boolean = false;
  @Input() unlockAll: boolean = false;
  @Input() unlockedCardIds: string[] = [];        // pass list of unlocked card IDs
  @Output() cardClick = new EventEmitter<Card>();   // new output
  // All cards from your service (assume you have a method to get them)
  allCards: Card[] = [];               // populated from service
  displayedCards: Card[] = [];         // filtered result
  enlargedCard: Card | null = null;
  showTypeFilter: boolean = true;
  showSubtypeFilter: boolean = true;
  showKeywordFilter: boolean = true;
  selectedType: string = 'All';
  selectedSubtype: string = 'All';
  selectedKeyword: string = 'All';
  //allSubtypes: string[] = [];
  //allKeywords: string[] = [];
  typeOptions: string[] = ['All', 'Creature', 'Item', 'Support', 'Action'];
  subtypeOptions: string[] = [];
  keywordOptions: string[] = [];
  selectedRarity: string = 'All';
  rarityOptions: string[] = ['All', 'Common', 'Rare', 'Epic', 'Legendary', 'Unique'];
  showExtraFilters: boolean = false;

  private setFolders: Record<string, string> = {
    'Core Set': 'core_set',
    'Dark Brotherhood': 'brotherhood',
    'Heroes of Skyrim': 'heroes_of_skyrim',
    'Madhouse Collection': 'madhouse',
    'Monthly Reward': 'reward_set',
    'Story Set': 'story_set',
    'Custom Set': 'custom_set'
  };

  constructor(private deckService: DeckService,
    private utilityService: UtilityService,
    public dialogRef: MatDialogRef<CollectionViewerComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.unlockedCardIds = data?.unlockedCardIds || [];
    this.unlockAll = data?.unlockAll ?? false;
  }

  // Filters
  selectedSet: string | null = 'Core Set';       // 'Core Set', 'Heroes of Skyrim', etc.
  selectedAttribute: string | null = 'R'; // 'Intelligence', 'Dual', etc.
  selectedMagicka: number | '7+' | 'X' | null = 2;
  showUnlockedOnly: boolean = false;        // toggle: true = unlocked only

  // Icon paths (adjust as needed)
  setIcons: Record<string, string> = {
    'Core Set': '/assets/tesl/images/icons/LG-icon-Core_Set.png',
    'Heroes of Skyrim': '/assets/tesl/images/icons/LG-icon-Heroes_of_Skyrim.png',
    'Dark Brotherhood': '/assets/tesl/images/icons/LG-icon-Dark_Brotherhood.png',
    'Story Set': '/assets/tesl/images/icons/LG-icon-Story_black.png',
    'Promotional': '/assets/tesl/images/icons/LG-icon-Promotional.png',
    'All': '/assets/tesl/images/icons/LG-icon-Prophecy_black.png'
  };

  rarityIcons: Record<string, string> = {
    'Common': '/assets/tesl/images/icons/common-icon.png',
    'Rare': '/assets/tesl/images/icons/rare-icon.png',
    'Epic': '/assets/tesl/images/icons/epic-icon.png',
    'Legendary': '/assets/tesl/images/icons/legendary-icon.png',
    'Unique': '/assets/tesl/images/icons/unique-icon.png'
  };

  attributeIcons: Record<string, string> = {
    'R': '/assets/tesl/images/icons/LG-icon-Strength.png',
    'B': '/assets/tesl/images/icons/LG-icon-Intelligence.png',
    'Y': '/assets/tesl/images/icons/LG-icon-Willpower.png',
    'G': '/assets/tesl/images/icons/LG-icon-Agility.png',
    'P': '/assets/tesl/images/icons/LG-icon-Endurance.png',
    'N': '/assets/tesl/images/icons/LG-icon-Neutral.png',
    'Dual': '/assets/tesl/images/icons/LG-icon-Dual_Attribute-small.png'
  };

  magickaIcons = [0, 1, 2, 3, 4, 5, 6, '7+','X'];

  filterExpanded = {
    set: false,
    attribute: false,
    magicka: false,
    type: false,
    subtype: false,
    keyword: false,
    rarity: false
  };

  ngOnInit() {
    this.allCards = this.deckService.getAllCards(); // your method
    this.buildFilterOptions();
    this.applyFilters(); // initial load
  }

  ngAfterViewInit() {
      this.firstFocusable?.nativeElement.focus();
  }

  close() {
    this.dialogRef.close();
  }

  getIconFileName(keyword: string): string {
    // Your files are like: LG-icon-Breakthrough.png
    // So we replace spaces with _, keep original casing
    let input = keyword;
    if (input === 'Stealth') input = 'Cover';
    if (['All','Charge','Ward'].includes(input)) return '';
    const fileName = input.replace(/\s+/g, '_');
    return `/assets/tesl/images/icons/LG-icon-${fileName}.png`;
  }

  toggleFilter(filter: 'set' | 'attribute' | 'magicka' | 'type' | 'subtype' | 'keyword' | 'rarity') {
    // Close others, toggle this one
    this.filterExpanded = {
        set: false,
        attribute: false,
        magicka: false,
        type: false,
        subtype: false,
        keyword: false,
        rarity: false,
        [filter]: !this.filterExpanded[filter]
    };
  }

  toggleTypeFilter() {
    this.filterExpanded = { ...this.filterExpanded, type: !this.filterExpanded.type };
  }

  toggleSubtypeFilter() {
    this.filterExpanded = { ...this.filterExpanded, subtype: !this.filterExpanded.subtype };
  }

  toggleKeywordFilter() {
    this.filterExpanded = { ...this.filterExpanded, keyword: !this.filterExpanded.keyword };
  }

  toggleRarityFilter() {
    this.filterExpanded = { ...this.filterExpanded, rarity: !this.filterExpanded.rarity };
  }

  selectType(type: string) {
    this.selectedType = type;
    this.filterExpanded.type = false;
    this.applyFilters();
  }

  selectSubtype(subtype: string) {
    this.selectedSubtype = subtype;
    this.filterExpanded.subtype = false;
    this.applyFilters();
  }

  selectKeyword(keyword: string) {
    this.selectedKeyword = keyword;
    this.filterExpanded.keyword = false;
    this.applyFilters();
  }

  selectRarity(rarity: string) {
    this.selectedRarity = rarity;
    this.filterExpanded.rarity = false;
    this.applyFilters();
  }

  get availMagicka() {
    if (this.hideStorySet) return this.magickaIcons.filter(i => i !== 'X');
    return this.magickaIcons
  }

  get customSetsAllowed(): boolean {
    const customSaved = localStorage.getItem('TESL_CustomSets');
    if (customSaved) return customSaved === 'true';
    return true;
  }

  private buildFilterOptions() {
    const subtypeSet = new Set<string>();
    const keywordSet = new Set<string>();

    this.allCards.forEach(card => {
      card.subtypes?.forEach(sub => subtypeSet.add(sub));
      card.keywords?.forEach(kw => keywordSet.add(kw));
      if (card.prophecy) keywordSet.add('Prophecy');
    });

    this.subtypeOptions = ['All', ...Array.from(subtypeSet).sort()];
    this.keywordOptions = ['All', ...Array.from(keywordSet).sort()];
  }

  applyFilters() {
    let filtered = [...this.allCards];

    // Set filter
    if (this.hideStorySet) {
      filtered = filtered.filter(c => c.set !== 'Story Set' && c.deckCodeId !== null);
      if (!this.unlockAll) filtered = filtered.filter(c => this.unlockedCardIds.includes(c.deckCodeId!));
    } else if (this.selectedSet && this.selectedSet !== 'All') {
      if (this.selectedSet === 'Promotional') {
        filtered = filtered.filter(c => 
          c.set === 'Monthly Reward' || c.set === 'Madhouse Collection' || c.set === 'Custom Set'
        );
      } else {
        filtered = filtered.filter(c => c.set === this.selectedSet);
      }
    } else if (this.selectedSet && this.selectedSet === 'All') {
      filtered = filtered.filter(c => c.set !== 'Story Set' && c.deckCodeId !== null);
    }

    if (!this.customSetsAllowed) filtered = filtered.filter(c => c.set !== 'Custom Set');

    // === NEW: Type Filter ===
    if (this.selectedType !== 'All') {
      filtered = filtered.filter(c => c.type === this.selectedType);
    }

    // === NEW: Subtype Filter ===
    if (this.selectedSubtype !== 'All') {
      filtered = filtered.filter(c => 
        c.subtypes?.some(sub => sub === this.selectedSubtype)
      );
    }

    if (this.selectedRarity !== 'All') {
      switch (this.selectedRarity) {
        case 'Common':
          filtered = filtered.filter(c => c.rarity === '1Common');
          break;
        case 'Rare':
          filtered = filtered.filter(c => c.rarity === '2Rare');
          break;
        case 'Epic':
          filtered = filtered.filter(c => c.rarity === '3Epic');
          break;
        case 'Legendary':
          filtered = filtered.filter(c => c.rarity === '4Legendary');
          break;
        case 'Unique':
          filtered = filtered.filter(c => c.rarity === '4Legendary' && c.unique === true);
          break;
      }
    }

    // === NEW: Keyword Filter ===
    if (this.selectedKeyword !== 'All') {
      if (this.selectedKeyword === 'Prophecy') {
        filtered = filtered.filter(c => c.prophecy === true);
      } else {
        filtered = filtered.filter(c => 
          c.keywords?.some(kw => kw === this.selectedKeyword)
        );
      }
    }

    // Restrict attributes when whitelist is provided
    if (this.attributeWhitelist) {
        filtered = filtered.filter(card => {
        // Allow neutral
        if (card.attributes.includes('N')) return true;

        // Allow if any attribute is in whitelist
        return card.attributes.every(attr => this.attributeWhitelist!.includes(attr));
        });
    } else if (this.selectedAttribute) {
      if (this.selectedAttribute === 'Dual') {
        filtered = filtered.filter(c => c.attributes.length > 1);
      } else {
        filtered = filtered.filter(c => c.attributes.includes(this.selectedAttribute!) &&
            c.attributes.length === 1);
      }
    }

    // Magicka filter
    if (this.selectedMagicka !== null && this.selectedMagicka !== 'X') {
      filtered = filtered.filter(c => {
        const cost = c.cost ?? 0;
        if (this.selectedMagicka === '7+') return cost >= 7;
        return cost === this.selectedMagicka;
      });
    }

    // Unlocked / locked toggle
    if (this.showUnlockedOnly) {
      filtered = filtered.filter(c => this.unlockedCardIds.includes(c.deckCodeId!));
    }

    this.displayedCards = filtered;
  }

  get unlockPct(): string {
    const total = this.displayedCards.filter(c => c.deckCodeId !== null).length;
    const unlocked = this.displayedCards.filter(c => this.unlockedCardIds.includes(c.deckCodeId!)).length;
    return `${Math.round((unlocked / total) * 100)}%`;
  }

  trackByInstanceId(index: number, card: Card): string {
    return card.instanceId!;
  }

  // Your existing logic for locked cards
  isCardLocked(card: Card): boolean {
    // Example – adjust to your unlock rules
    if (card.set === 'Story Set') return true; // always locked
    if (card.deckCodeId === null) return true;
    if (this.unlockAll) return false;
    if (this.unlockedCardIds.includes(card.deckCodeId!)) return false;
    // ... other conditions (e.g. reward sets, chapter progress)
    return true;
  }

  // Filter clicks
  selectSet(set: string | null) {
    this.selectedSet = set;//this.selectedSet === set ? null : set;
    //this.filterExpanded.set = false;
    this.applyFilters();
  }

  selectAttribute(attr: string | null) {
    this.selectedAttribute = attr;//this.selectedAttribute === attr ? null : attr;
    //this.filterExpanded.attribute = false;
    this.applyFilters();
  }

  selectMagicka(cost: number | '7+' | 'X' | null) {
    if (this.hideStorySet && cost === 'X') return;
    this.selectedMagicka = cost;//this.selectedMagicka === cost ? null : cost;
    //this.filterExpanded.magicka = false;
    this.applyFilters();
  }

  toggleExtraFilters() {
    this.showExtraFilters = !this.showExtraFilters;
  }

  toggleUnlockedOnly() {
    this.showUnlockedOnly = !this.showUnlockedOnly;
    this.applyFilters();
  }

  enlargeCard(card: Card) {
    if (this.enableOutput) {
      this.cardClick.emit(card);
    } else {
      this.enlargedCard = card;
    }
  }

  closeCard() {
    this.enlargedCard = null;
  }

  get enlargedCardImage(): string {
    return this.utilityService.getCardImageByName(this.enlargedCard ? this.enlargedCard.name : 'placeholder'
      , this.setFolders[this.enlargedCard ? this.enlargedCard.set : '']);
  }
}