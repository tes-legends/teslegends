import { Component, OnInit, AfterViewInit, ElementRef, ViewChild, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Card, DeckService, DeckEntry, SavedDeck } from '../tesl/deck.service';

@Component({
  selector: 'app-deck-builder',
  templateUrl: './deck-builder.component.html',
  styleUrls: ['./deck-builder.component.scss']
})
export class DeckBuilderComponent implements OnInit, AfterViewInit {
     @ViewChild('firstFocusable') firstFocusable!: ElementRef;

  savedDecks: SavedDeck[] = [];
  // === DATA ===
  allCards: Card[] = [];               // all collectible cards
  displayedCards: Card[] = [];         // filtered cards
  currentDeck: DeckEntry[] = [];       // deck being built
  deckName: string = 'New Deck';
  unlockedCardIds: string[] = [];   // passed from parent
  unlockAll: boolean = false;

  // === CLASS SELECTION ===
  selectedClass: any = null;           // selected class object

  // === FILTERS (reuse your existing ones) ===
  selectedSet: string | null = null;
  selectedAttribute: string | null = null;
  selectedMagicka: number | '7+' | null = null;
  showUnlockedOnly: boolean = true;

  // === DECK LIMITS ===
  maxDeckSize = 50;
  maxCopiesPerCard = 3;

  attributeIcons: { [key: string]: string } = {
    'R': '/assets/tesl/images/icons/LG-icon-Strength.png',
    'Y': '/assets/tesl/images/icons/LG-icon-Willpower.png',
    'P': '/assets/tesl/images/icons/LG-icon-Endurance.png',
    'B': '/assets/tesl/images/icons/LG-icon-Intelligence.png',
    'G': '/assets/tesl/images/icons/LG-icon-Agility.png',
    'N': '/assets/tesl/images/icons/LG-icon-Neutral.png'
    // Add more if needed (e.g. dual/tri attributes)
  };

  readonly classes = [
    { name: 'Archer', attributes: ['R','G'], color: '#ff4444' },
    { name: 'Assassin', attributes: ['B','G'], color: '#0066ff' },
    { name: 'Battlemage', attributes: ['R','B'], color: '#ffcc00' },
    { name: 'Crusader', attributes: ['R','Y'], color: '#00cc66' },
    { name: 'Mage', attributes: ['B','Y'], color: '#cc66ff' },
    { name: 'Monk', attributes: ['Y', 'G'], color: '#9966ff' },
    { name: 'Scout', attributes: ['G', 'P'], color: '#ff6666' },
    { name: 'Sorcerer', attributes: ['B', 'P'], color: '#ff9900' },
    { name: 'Spellsword', attributes: ['Y', 'P'], color: '#66cc99' },
    { name: 'Warrior', attributes: ['R', 'P'], color: '#6699ff' },
    // Add more if needed (e.g. Archer, Warrior, etc.)
  ];

  constructor(private deckService: DeckService,
      public dialogRef: MatDialogRef<DeckBuilderComponent>,
      @Inject(MAT_DIALOG_DATA) public data: any
    ) {
      this.unlockedCardIds = data?.unlockedCardIds || [];
      this.unlockAll = data?.unlockAll ?? false;
    }

  ngOnInit() {
    //this.allCards = this.deckService.getAllCards(); // your method
    //this.applyFilters();
    this.loadSavedDecks();
  }

  ngAfterViewInit() {
      this.firstFocusable?.nativeElement.focus();
  }

  selectClass(cls: any) {
    this.selectedClass = cls;
    this.currentDeck = [];           // clear current deck
    this.deckName = `New ${cls.name} Deck`;
    //this.applyFilters();
  }

  toggleCard(card: Card) {
    const existing = this.currentDeck.find(e => e.card.id === card.id);

    if (existing) {
      if (existing.count >= 3) {
        // Remove all copies if at max
        this.currentDeck = this.currentDeck.filter(e => e.card.id !== card.id);
      } else if (card.unique && existing.count >= 1) {
        // Remove all copies if unique
        this.currentDeck = this.currentDeck.filter(e => e.card.id !== card.id);
      } else {
        existing.count++;
      }
    } else {
      // Add new card
      const totalCards = this.currentDeck.reduce((sum, e) => sum + e.count, 0);
      this.currentDeck.push({ card: {...card}, count: 1 });
    }

    // Sort deck by cost
    this.currentDeck.sort((a, b) => (a.card.cost ?? 0) - (b.card.cost ?? 0));
  }

  removeAllCopies(card: Card) {
    this.currentDeck = this.currentDeck.filter(e => e.card.id !== card.id);
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

  get currentDeckTotal(): number {
    return this.currentDeck.reduce((sum, e) => sum + e.count, 0);
  }

  get allowedAttributes(): string[] {
    if (!this.selectedClass) return ['N'];
    return ['N', ...this.selectedClass.attributes];
  }

  async importDeck() {
    const incomingCode = await navigator.clipboard.readText();
    const deckEntries = this.deckService.decodeDeckCode(incomingCode);
    if (deckEntries && deckEntries.length > 0) {
      const codes = incomingCode.substring(2);
      // Split every 2 characters
      for (let i = 0; i < codes.length; i += 2) {
        const dc = codes.slice(i,i+2);
        if (!dc.startsWith('A') && !dc.startsWith('B')) {
          if (!this.unlockedCardIds.includes(dc)) {
            alert(`Card with code ${dc} not unlocked yet`);
            return;
          }
        }
      }
      const deckAttr: string[] = [];
      deckEntries.forEach(e => {
        e.card.attributes.forEach(a => {
          if (a !== 'N' && !deckAttr.includes(a)) deckAttr.push(a);
        })
      });
      if (deckAttr.length > 2) {
        alert('too many attributes');
        return;
      } else if (deckAttr.length === 0) {
        deckAttr.push('R');
        deckAttr.push('G');
      } else if (deckAttr.length < 2) {
        if (deckAttr.includes('R')) {
          deckAttr.push('G');
        } else {
          deckAttr.push('R');
        }
      }
      let deckClass = this.classes.find(cls => 
        cls.attributes[0] === deckAttr[0] && cls.attributes[1] === deckAttr[1]
      );
      if (!deckClass) {
        deckClass = this.classes.find(cls => 
          cls.attributes[0] === deckAttr[1] && cls.attributes[1] === deckAttr[0]
        );
      }
      if (!deckClass) {
        alert('error finding class');
        return;
      }
      this.currentDeck = deckEntries;
      this.selectedClass = deckClass;
      this.deckName = deckClass.name + Array.from({length: 4}, () => 
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        .charAt(Math.floor(Math.random() * 62))
      ).join('');
    } else {
      alert('invalid code');
      return;
    }
  }

  exportDeck() {
    navigator.clipboard.writeText(this.deckService.encodeDeckCode(this.currentDeck));
  }

  // Placeholder for save
  saveDeck() {
    if (!this.deckName.trim()) {
      alert('Please enter a deck name');
      return;
    }
    if (this.currentDeck.length === 0) {
      alert('Deck is empty');
      return;
    }
    if (this.currentDeckTotal !== 50) {
      alert('Deck is not 50 cards');
      return;
    }

    const trimmedName = this.deckName.trim();
    const deckCode = this.deckService.encodeDeckCode(this.currentDeck);
    const savedDeck: SavedDeck = {
      name: trimmedName,
      deckCode,
      attributes: this.selectedClass?.attributes || []
    };

    // Save to localStorage (append to list)
    // Load existing decks
    let savedDecks: SavedDeck[] = JSON.parse(localStorage.getItem('custom_decks') || '[]');

    // Check if name already exists → overwrite
    const existingIndex = savedDecks.findIndex(d => d.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingIndex !== -1) {
      if (!confirm(`A deck named "${trimmedName}" already exists. Overwrite it?`)) {
        return;
      }
      savedDecks[existingIndex] = savedDeck;
    } else {
      savedDecks.push(savedDeck);
    }

    localStorage.setItem('custom_decks', JSON.stringify(savedDecks));
  }

  loadSavedDecks() {
    const saved = localStorage.getItem('custom_decks');
    if (saved) {
      this.savedDecks = JSON.parse(saved);
    }
  }

  loadSavedDeck(deck: SavedDeck) {
    this.deckName = deck.name;
    this.currentDeck = this.deckService.decodeDeckCode(deck.deckCode)!;
    this.selectedClass = this.classes.find(cls =>
      cls.attributes[0] === deck.attributes[0] && cls.attributes[1] === deck.attributes[1]
    );
  }

  deleteDeck() {
    const dName = this.deckName;
    if (!confirm(`Delete deck "${dName}"? This cannot be undone.`)) {
      return;
    }

    let savedDecks: SavedDeck[] = JSON.parse(localStorage.getItem('custom_decks') || '[]');
    savedDecks = savedDecks.filter(d => d.name.toLowerCase() !== dName.toLowerCase());
    localStorage.setItem('custom_decks', JSON.stringify(savedDecks));

    this.loadSavedDecks();

    // If currently editing this deck → clear editor
      this.currentDeck = [];
      this.deckName = 'New Deck';

    alert(`Deck "${dName}" deleted`);
  }

  closeDeck() {
    this.deckName = 'New Deck';
    this.currentDeck = [];
    this.selectedClass = null;
  }

  close() {
    this.dialogRef.close({
      savedDecks: this.savedDecks
    });
  }

  // Your existing lock check
  isCardLocked(card: Card): boolean {
    // Implement your logic (story always locked, etc.)
    return card.set === 'Story';
  }

  // TrackBy for performance
  trackByCardId(index: number, card: Card): string {
    return card.id;
  }
}