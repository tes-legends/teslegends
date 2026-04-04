//tesl-card.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Card } from '../tesl/deck.service';

@Component({
  selector: 'app-tesl-card',
  templateUrl: './tesl-card.component.html',
  styleUrls: ['./tesl-card.component.scss']
})
export class TeslCardComponent {

  @Input() card!: Card;
  @Input() isOpponent = false;
  @Input() canPlay = false;

  @Input() index: number = 0;         // for hand position
  @Input() laneIndex: number = 0;     // for board lane (0 = left, 1 = right)

  @Output() playCard = new EventEmitter<Card>();
  @Output() enlarge = new EventEmitter<Card>();

  @Input() canPlayFromModal = false; // ← NEW: allow play even if not in hand
  @Output() playFromModal = new EventEmitter<Card>(); // ← NEW

  @Input() isTargetable = false;
  @Output() targetClick = new EventEmitter<Card>();
  @Input() isStagingActive = false;

  @Input() isActivatable = false;
  @Output() activateSupport = new EventEmitter<Card>();

  @Input() isAttackable = false;
  @Output() attack = new EventEmitter<Card>();

  @Input() isSelected = false;      // new input
  @Output() cardSelect = new EventEmitter<Card>();   // new output

  @Input() isGraveyard = false;      // new input for discard view

  get isInHand(): boolean {
    return this.index !== undefined && this.laneIndex === undefined;
  }

  private setFolders: Record<string, string> = {
    'Core Set': 'core_set',
    'Dark Brotherhood': 'brotherhood',
    'Heroes of Skyrim': 'heroes_of_skyrim',
    'Madhouse Collection': 'madhouse',
    'Monthly Reward': 'reward_set',
    'Custom Set': 'custom_set',
    'Story Set': 'story_set'
  };

  // Prevent click from bubbling when enlarging
  openLargeView(event: Event) {
    event.stopPropagation();
    // We'll implement the modal in step 3
    //alert('Full-size card view coming soon!'); // temporary
    this.enlarge.emit(this.card);
    // Future: show modal with large image
  }

  get cardImageUrl(): string {
    if (!this.card?.name) return '/assets/tesl/images/core_set/cards/placeholder.png';

    // Convert name to filename: spaces → underscores, no special chars
    const fileName = this.card.name
      .replace(/[^a-zA-Z0-9'\s-]/g, '')  // remove apostrophes, commas, etc.
      .trim()
      .split(/\s+/)
      .join('_');
    
    const set = this.card.set || 'Core Set'; // default to Core Set if undefined

    return `/assets/tesl/images/${this.setFolders[set] || 'core_set'}/cards/${fileName}.png`;
  }

  get displayPower(): number {
    return this.card.attack ?? 0;
  }

  get displayHealth(): number {
    return this.card.health ?? 0;
  }

  /*onClick() {
    // Normal hand/board click
    if (!this.isOpponent && this.canPlay) {
      this.playCard.emit(this.card);
    }
  }*/

  // Optional: list of keywords you actually have icons for
  private readonly supportedKeywords = [
    'BeastForm', 'Breakthrough', 'Guard', 'LastGasp', 'Pilfer', 
    'Rally', 'Expertise', 'Slay', 'Regenerate', 'TreasureHunt', 
    'Veteran', 'Lethal','Drain'
    // Add more as you create icons
  ];

  // Get only the keywords we have icons for
  getVisibleKeywords(keywords: string[]): string[] {
    return (keywords || []).filter(kw => 
      this.supportedKeywords.includes(kw)
    ).slice(0, 5);
  }

  // Convert keyword name to filename (case-sensitive match to your assets)
  getIconFileName(keyword: string): string {
    // Your files are like: LG-icon-Breakthrough.png
    // So we replace spaces with _, keep original casing
    return keyword.replace(/\s+/g, '_');
  }

  // Optional: fallback if icon fails to load
  handleIconError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.src = '/assets/tesl/images/icons/placeholder.png'; // or a generic keyword icon
    img.alt = 'Icon missing';
  }

  onCardClick(event: MouseEvent) {
    if (this.isTargetable) {
      // Target mode takes priority
      this.targetClick.emit(this.card);
      return;
    }
    
    // Normal play mode (hand only)
    /*if (!this.isOpponent && this.canPlay) {
      this.playCard.emit(this.card);
      return;
    }*/

    if (!this.isStagingActive) {

      event.stopPropagation();
      event.preventDefault();
      if (/*this.card.isOpponent || */this.isGraveyard) {
        this.enlarge.emit(this.card);
      } else {
        console.log('friendly card - selecting');
        // Normal left-click → select / deselect
        this.cardSelect.emit(this.card);
      }
    }

  }

  playFromEnlarged() {
    if (this.canPlayFromModal) {
      this.playFromModal.emit(this.card);
    }
  }

}
