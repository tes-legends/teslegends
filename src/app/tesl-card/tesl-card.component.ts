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

  @Input() index: number = 0;
  @Input() laneIndex: number = 0;

  @Output() exaltCard = new EventEmitter<Card>();
  @Output() playCard = new EventEmitter<Card>();
  @Output() enlarge = new EventEmitter<Card>();

  @Input() canPlayFromModal = false;
  @Output() playFromModal = new EventEmitter<Card>();

  @Input() isTargetable = false;
  @Output() targetClick = new EventEmitter<Card>();
  @Input() isStagingActive = false;

  @Input() isActivatable = false;
  @Output() activateSupport = new EventEmitter<Card>();

  @Input() isAttackable = false;
  @Output() attack = new EventEmitter<Card>();

  @Input() isSelected = false;
  @Output() cardSelect = new EventEmitter<Card>();

  @Input() isGraveyard = false;

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

  openLargeView(event: Event) {
    event.stopPropagation();
    this.enlarge.emit(this.card);
  }

  get cardImageUrl(): string {
    if (!this.card?.name) return '/assets/tesl/images/core_set/cards/placeholder.webp';
    const fileName = this.card.name
      .replace(/[^a-zA-Z0-9'\s-]/g, '')
      .trim()
      .split(/\s+/)
      .join('_');    
    const set = this.card.set || 'Core Set';
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

  getVisibleKeywords(keywords: string[]): string[] {
    return (keywords || []).filter(kw => 
      this.supportedKeywords.includes(kw)
    ).slice(0, 5);
  }

  getIconFileName(keyword: string): string {
    return keyword.replace(/\s+/g, '_');
  }

  handleIconError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.src = '/assets/tesl/images/icons/placeholder.webp'; // or a generic keyword icon
    img.alt = 'Icon missing';
  }

  onCardClick(event: MouseEvent) {
    if (this.isTargetable) {
      this.targetClick.emit(this.card);
      return;
    }
    if (!this.isStagingActive) {
      event.stopPropagation();
      event.preventDefault();
      if (this.isGraveyard) {
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
