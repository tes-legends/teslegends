//tesl-card.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Card } from '../tesl/deck.service';

@Component({
    selector: 'app-tesl-card',
    templateUrl: './tesl-card.component.html',
    styleUrls: ['./tesl-card.component.scss'],
    standalone: false
})
export class TeslCardComponent {

  @Input() card!: Card;
  @Input() isOpponent = false;
  @Input() canPlay = false;
  @Input() canExalt = false;

  @Input() size: string = 'small';

  @Input() index: number = 0;         // for hand position
  @Input() laneIndex: number = 0;     // for board lane (0 = left, 1 = right)

  @Output() exaltCard = new EventEmitter<Card>();
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

  get costDisplay(): number {
    return (this.card.currentCost! < 0 ? 0 : this.card.currentCost!);
  }

  get healthDisplay(): number {
    return (this.card.currentHealth ?? this.card.health ?? 0) < 0 ? 0 :
        (this.card.currentHealth ?? this.card.health ?? 0) > 99 ? 99 :
        (this.card.currentHealth ?? this.card.health ?? 0);
  }

  get attackDisplay(): number {
    return (this.card.currentAttack ?? this.card.attack ?? 0) < 0 ? 0 :
        (this.card.currentAttack ?? this.card.attack ?? 0) > 99 ? 99 :
        (this.card.currentAttack ?? this.card.attack ?? 0);
  }

  get showStats(): boolean {
    return (this.card.type === 'Creature' || this.card.type === 'Item') &&
    ((this.card.currentAttack !== undefined && this.card.currentAttack !== this.card.attack) ||
    (this.card.currentHealth !== undefined && this.card.currentHealth !== this.card.health));
  }

  get attackBuffed(): boolean {
    return (this.card.currentAttack ?? this.card.attack ?? 0) > (this.card.attack ?? 0);
  }

  get attackNerfed(): boolean {
    return (this.card.currentAttack ?? this.card.attack ?? 0) < (this.card.attack ?? 0);
  }

  get wounded(): boolean {
    return (this.card.currentHealth ?? this.card.health ?? 0) < (this.card.maxHealth ?? this.card.health ?? 0) ||
      (this.card.maxHealth ?? this.card.health ?? 0) < (this.card.health ?? this.card.health ?? 0);
  }

  get healthBuffed(): boolean {
    return (this.card.currentHealth ?? this.card.health ?? 0) > (this.card.health ?? 0);
  }

  private setFolders: Record<string, string> = {
    'Core Set': 'core_set',
    'Dark Brotherhood': 'brotherhood',
    'Heroes of Skyrim': 'heroes_of_skyrim',
    'Houses of Morrowind': 'morrowind',
    'Clockwork City': 'clockwork',
    'Madhouse Collection': 'madhouse',
    'Forgotten Hero Collection': 'forgotten',
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
    if (!this.card?.name) return '/assets/tesl/images/core_set/cards/placeholder.webp';

    // Convert name to filename: spaces → underscores, no special chars
    const fileName = this.card.name
      .replace(/[^a-zA-Z0-9'\s-]/g, '')  // remove apostrophes, commas, etc.
      .trim()
      .split(/\s+/)
      .join('_');
    
    const set = this.card.set || 'Core Set'; // default to Core Set if undefined

    return `/assets/tesl/images/${this.setFolders[set] || 'core_set'}/cards/${fileName}.webp`;
  }

  get displayPower(): number {
    return this.card.attack ?? 0;
  }

  get displayHealth(): number {
    return this.card.health ?? 0;
  }

  private readonly supportedKeywords = [
    'BeastForm', 'Breakthrough', 'Guard', 'LastGasp', 'Pilfer', 
    'Rally', 'Expertise', 'Slay', 'Regenerate', 'TreasureHunt', 
    'Veteran', 'Lethal','Drain'
  ];

  // Get only the keywords we have icons for
  getVisibleKeywords(keywords: string[]): string[] {
    return (keywords || []).filter(kw => 
      this.supportedKeywords.includes(kw)
    ).slice(0, 5);
  }

  // Convert keyword name to filename (case-sensitive match to your assets)
  getIconFileName(keyword: string): string {
    return keyword.replace(/\s+/g, '_');
  }

  // Optional: fallback if icon fails to load
  handleIconError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.src = '/assets/tesl/images/icons/placeholder.webp'; // or a generic keyword icon
    img.alt = 'Icon missing';
  }

  onCardClick(event: MouseEvent) {
    if (this.isTargetable) {
      // Target mode takes priority
      this.targetClick.emit(this.card);
      return;
    }

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
