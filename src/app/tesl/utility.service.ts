//utility.service.ts
import { Injectable } from '@angular/core';
import { Card, CardEffect } from './deck.service';

export interface HelpRule {
  title: string;
  content: string;
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

@Injectable({
  providedIn: 'root'
})
export class UtilityService {

  readonly helpRules: HelpRule[] = [
      {
        title: "Welcome to TES: Legends",
        content: `
          • This is a fan tribute to Bethesda's The Elder Scrolls: Legends, which was shut down in Jan 2025.<br>
          • Two players duel using decks of creatures, actions, items, and supports.<br>
          • The goal is to reduce your opponent's health to 0 with a combination of creature attacks and actions.<br>
          • This game uses assets (card images & audio) copyrighted by Bethesda Softworks.<br>
        `
      },
      {
        title: "Starting the Game",
        content: `
          • Each player starts with 30 health and a deck of 50 cards.<br>
          • One player goes first (randomly).<br>
          • Second player starts with a Ring of Magicka in play.<br>
          • Max magicka increases by 1 each turn (for 12 rounds).<br>
          • Both players can mulligan any of their initial 3 cards to get replacements.
        `
      },
      {
        title: "Playing Cards",
        content: `
          • Cards cost magicka to play (shown in top-left corner).<br>
          • Creatures go to a lane (Shadow or Field), and will have attack (left number) and health (right number).<br>
          • Items attach to creatures and give permanent buffs (count of equipped items will show in top-right corner of creature).<br>
          • Actions are one-time spells (damage, draw, summon, etc.).<br>
          • Supports play to support bar and provide ongoing and/or activated effects. These are displayed as gray circle on left side indicating number of supports. If the support card has activations, number of available activations left will show in top right of the card.
        `
      },
      {
        title: "Lanes & Attacking",
        content: `
          • There are two lanes: Field (left) and Shadow (right).<br><br>
          • Creatures can't attack on turn played unless they have Charge.
          • Creatures played in Shadow lane are granted Cover (unless they have Guard) and can't be attacked for one turn.<br>
          • Creatures attack once per turn (unless they gain extra attacks).<br>
          • When attacking, you choose an enemy creature in your lane (or your opponent if no guards).
        `
      },
      {
        title: "Keywords & Mechanics",
        content: `
          • <strong>Guard</strong>: Must be attacked before the opponent or other creatures.<br>
          • <strong>Lethal</strong>: Destroys any creature it damages (even 1 damage).<br>
          • <strong>Charge</strong>: Can attack the turn it's played.<br>
          • <strong>Drain</strong>: Healing equal to damage dealt when attacking.<br>
          • <strong>Prophecy</strong>: Can be played for free when drawn from a rune.<br>
          • <strong>Last Gasp</strong>: Triggers when the creature dies.<br>
          • <strong>Ward</strong>: Blocks next instance of damage and is then broken.<br>
          • <strong>Breakthrough</strong>: Excess combat damage when attacking is dealt to your opponent.<br>
          • <strong>Regenerate</strong>: Creature fully heals at the start of its owner's turn.<br>
          • <strong>Pilfer</strong>: Triggers when creature deals damage to opponent.<br>
          • <strong>Slay</strong>: Triggers when the creature kills another creature and survives.<br>
          • <strong>Silence</strong>: Destroys any attached items, removes any effects or keywords for the creature and resets creature to base attack and health.
        `
      },
      {
        title: "Runes & Prophecy",
        content: `
          • You start with 5 runes (health thresholds: 25, 20, 15, 10, 5).<br>
          • When health drops to or below a threshold → break a rune → draw a card.<br>
          • If the drawn card has <strong>Prophecy</strong>, you may play it <strong>for free</strong> immediately.
        `
      },
      {
        title: "Winning the Game",
        content: `
          • Reduce opponent's health to 0 or below.<br>
          • The game ends immediately when one player reaches 0 health.<br>
          • A player loses immediately has no runes left when attempting to draw from an empty deck (if any runes are in tact, one will be broken instead).
        `
      },
      {
        title: "Helpful Info",
        content: `
          • You can have at most 10 cards in hand. If a prophecy triggers while your hand is full, you will have a chance to play it, but skipping the play will burn the card. <br>
          • Creatures can attack once per turn unless buffed.<br>
          • Max magicka caps at 12, unless you play cards that affect max magicka.<br>
          • Rally keyword is not available on any cards, but may be obtained from random effects.<br>
          • [ESC] will open menu, [ENTER] will end your turn, and [SPACEBAR] will stage play/attack for the selected card.<br>
          • You can click on (💀) button to see discard piles or the (📜) button to see history of actions.<br>
          • Effects that grant random keywords will choose one of the following: 'Breakthrough', 'Charge', 'Drain', 'Guard', 'Lethal', 'Rally', 'Regenerate', 'Ward'. The same keyword can be granted multiple times but will not stack.
        `
      }
    ];

  private readonly KEYS = {
    CHAPTER_PROGRESS: 'forgotten_hero_progress',
    ARENA_ELO: 'TESL_arena_elo',
    UNLOCKED_CARDS: 'unlocked_cards',
    ARENA_LAST_REWARD_DATE: 'arena_last_reward_date',
    ARENA_LAST_ELO_REWARD: 'arena_last_elo_reward'
  };

  public readonly fabricatePool = [
    { type: 'keyword', value: 'Breakthrough', text: 'Breakthrough' },
    { type: 'keyword', value: 'Drain',        text: 'Drain' },
    { type: 'keyword', value: 'Guard',        text: 'Guard' },
    { type: 'keyword', value: 'Lethal',       text: 'Lethal' },
    { type: 'keyword', value: 'Regenerate',   text: 'Regenerate' },
    { type: 'keyword', value: 'Ward',         text: 'Ward' },
    { type: 'effect',  value: 'summonDamage', text: 'Summon: Deal 1 damage' },
    { type: 'effect',  value: 'summonHeal',   text: 'Summon: You gain 2 health' },
    { type: 'effect',  value: 'summonBuff',   text: 'Summon: Give another creature +1/+1' },
    { type: 'effect',  value: 'pilferBuff',   text: 'Pilfer: +1/+1' },
  ];

  constructor() {}


  public generateFabricateStatChoices(): number[] {
    // Generate 3 unique numbers between 1 and 12
    const rolls: number[] = [];
    
    while (rolls.length < 3) {
      const roll = Math.floor(Math.random() * 12) + 1;
      if (!rolls.includes(roll)) {
        rolls.push(roll);
      }
    }

    // Sort lowest to highest
    rolls.sort((a, b) => a - b);

    // Create final choices
    return rolls;
  }

  public generateFabricateKeywordChoices() {
    // Shuffle and take 3 unique
    return this.shuffle(this.fabricatePool).slice(0, 3);
  }

  public applyFabricateAbility(selectedCreature: Card, selectedAbility: any) {
    if (selectedAbility.type === 'keyword') {
      selectedCreature.currentKeywords = Array.from(
        new Set([
          ...(selectedCreature.currentKeywords ?? []),
          ...([selectedAbility.value])
        ])
      );
    } else {
      switch(selectedAbility.value) {
        case 'summonDamage': {
          const newEffect: CardEffect = {
            "trigger": "Summon",
            "type": "damage",
            "amount": 1,
            "target": "any"
          };
          selectedCreature.effects!.push(newEffect);
          break;
        }
        case 'summonHeal': {
          const newEffect: CardEffect = {
            "trigger": "Summon",
            "type": "damage",
            "amount": -2,
            "target": "player"
          }
          selectedCreature.effects!.push(newEffect);
          break;
        }
        case 'summonBuff': {
          const newEffect: CardEffect = {
            "trigger": "Summon",
            "type": "buffTarget",
            "modAttack": 1,
            "modHealth": 1,
            "target": "creatureOther"
          }
          selectedCreature.effects!.push(newEffect);
          break;
        }
        case 'pilferBuff': {
          const newEffect: CardEffect = {
            "trigger": "Pilfer",
            "type": "buffSelf",
            "modAttack": 1,
            "modHealth": 1
          }
          selectedCreature.effects!.push(newEffect);
          selectedCreature.currentKeywords = Array.from(
            new Set([
              ...(selectedCreature.currentKeywords ?? []),
              ...(['Pilfer'])
            ])
          );
          break;
        }
      }
    }
  }

  getCardImageByName(name: string, set?: string): string {
      const lookupSet = set ?? 'core_set';
      const fileName = name
          .replace(/[^a-zA-Z0-9'\s-]/g, '')  // remove apostrophes, commas, etc.
          .trim()
          .split(/\s+/)
          .join('_');

      return `/assets/tesl/images/${lookupSet}/cards/${fileName}.webp`;
  }

  shuffle<T>(array: T[]): T[] {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
  }

  random<T>(arr: T[]): T {
      return arr[Math.floor(Math.random() * arr.length)];
  }

  exportProgressToClipboard() {
    const rankedJson = localStorage.getItem('tesl_ranked_state');
    let rankedState: RankedSaveState = JSON.parse(rankedJson || '{}');
    const progressData = {
      lastCompletedChapterIndex: parseInt(localStorage.getItem(this.KEYS.CHAPTER_PROGRESS) || '-1', 10),
      arenaElo: parseInt(localStorage.getItem(this.KEYS.ARENA_ELO) || '1200', 10),
      unlockedCards: JSON.parse(localStorage.getItem(this.KEYS.UNLOCKED_CARDS) || '[]'),
      cheatUsed: localStorage.getItem('TESL_cheats_ever') === 'true',
      arenaLastRewardDate: localStorage.getItem(this.KEYS.ARENA_LAST_REWARD_DATE) || '',
      arenaLastEloReward: parseInt(localStorage.getItem(this.KEYS.ARENA_LAST_ELO_REWARD) || '0', 10),
      rankedTier: rankedState.currentTier || 0,
      rankedStarRewards: rankedState.lastRewardStars || {},
      rankedResetMonth: rankedState.lastResetMonth || ''
    };

    // Generate checksum
    const exportObject = {
      version: 3,
      exportedAt: new Date().toISOString(),
      data: progressData
    };

    const checksum = this.generateChecksum(exportObject.data);

    const finalExport = {
      ...exportObject,
      checksum: checksum
    };

    const jsonString = JSON.stringify(finalExport, null, 2);

    navigator.clipboard.writeText(jsonString).then(() => {
      alert('✅ Progress exported to clipboard!\n\nSave this text somewhere safe.');
    }).catch(err => {
      console.error('Clipboard write failed', err);
      alert('Failed to copy to clipboard. Please try again.');
    });
  }

  async importProgressFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        alert('Clipboard is empty.');
        return;
      }

      const imported = JSON.parse(text.trim());

      const data = imported.data || imported;

      // Validate checksum
      const receivedChecksum = imported.checksum;
      const expectedChecksum = this.generateChecksum(data);

      if (receivedChecksum !== expectedChecksum) {
        alert('❌ Invalid or tampered progress data!');
        return;
      }

      // Restore data safely
      let cheatCleared = true;
      if (data.lastCompletedChapterIndex !== undefined) {
        if (data.lastCompletedChapterIndex.toString() !== -1) cheatCleared = false;
        localStorage.setItem(this.KEYS.CHAPTER_PROGRESS, data.lastCompletedChapterIndex.toString());
      }

      if (data.arenaElo !== undefined) {
        if (data.arenaElo.toString() !== '1200') cheatCleared = false;
        localStorage.setItem(this.KEYS.ARENA_ELO, data.arenaElo.toString());
      }

      if (data.unlockedCards) {
        if (Array.isArray(data.unlockedCards) && data.unlockedCards.length > 0) cheatCleared = false;
        localStorage.setItem(this.KEYS.UNLOCKED_CARDS, JSON.stringify(data.unlockedCards));
      }

      if (data.arenaLastRewardDate !== undefined) {
        if (data.arenaLastRewardDate.toString() !== '') cheatCleared = false;
        localStorage.setItem(this.KEYS.ARENA_LAST_REWARD_DATE, data.arenaLastRewardDate);
      }

      if (data.arenaLastEloReward !== undefined) {
        if (data.arenaLastEloReward.toString() !== '0') cheatCleared = false;
        localStorage.setItem(this.KEYS.ARENA_LAST_ELO_REWARD, data.arenaLastEloReward.toString());
      }

      if (cheatCleared) {
        console.log('⚠️ Imported progress is identical to default/reset state. Clear chat flags');
        localStorage.removeItem('TESL_cheats_ever');
        localStorage.removeItem('tesl_cheat');
      } else {
        if (data.cheatUsed) {
          console.log('⚠️ Imported progress indicates cheats were used. Setting cheat flags');
          localStorage.setItem('TESL_cheats_ever', 'true');
        } else {            
          localStorage.removeItem('TESL_cheats_ever');
          localStorage.removeItem('tesl_cheat');
        }
      }

      const rankedJson = localStorage.getItem('tesl_ranked_state');
      let rankedState: RankedSaveState = JSON.parse(rankedJson || '{}');
      if (data.rankedTier !== undefined) rankedState.currentTier = data.rankedTier;
      if (data.rankedStarRewards !== undefined) rankedState.lastRewardStars = data.rankedStarRewards;
      if (data.rankedResetMonth !== undefined) {
        rankedState.lastResetMonth = data.rankedResetMonth;        
        localStorage.setItem('tesl_ranked_last_reset', data.rankedResetMonth);
      }
      if (!rankedJson || !rankedState) {
        rankedState = {
          currentTier: data.rankedTier || 0,
          currentStars: 0,
          lastRewardStars: data.rankedStarRewards || {},
          lastResetMonth: data.rankedResetMonth || '',
          totalWins: 0,
          totalLosses: 0,
          rewardSets: [],
          rewardIndex: -1
        };
      }
      localStorage.setItem('tesl_ranked_state', JSON.stringify(rankedState));

      alert('✅ Progress successfully imported!\n\nPlease refresh the page to apply changes.');

      setTimeout(() => window.location.reload(), 1500);

    } catch (e) {
      console.error(e);
      alert('❌ Failed to import progress.\n\nMake sure you pasted the exact exported text.');
    }
  }

  private generateChecksum(data: any): string {
    const salt = "TESL_PROGRESS_2026";
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    const str = salt + normalized;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).toUpperCase();
  }
}