//utility.service.ts
import { Injectable } from '@angular/core';

export interface HelpRule {
  title: string;
  content: string;
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
      ARENA_LAST_ELO_REWARD: 'arena_last_elo_reward'   // ← added
    };

    constructor() {}

    getCardImageByName(name: string, set?: string): string {
        const lookupSet = set ?? 'core_set';
        const fileName = name
            .replace(/[^a-zA-Z0-9'\s-]/g, '')  // remove apostrophes, commas, etc.
            .trim()
            .split(/\s+/)
            .join('_');

        return `/assets/tesl/images/${lookupSet}/cards/${fileName}.png`;
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
      const progressData = {
        lastCompletedChapterIndex: parseInt(localStorage.getItem(this.KEYS.CHAPTER_PROGRESS) || '-1', 10),
        arenaElo: parseInt(localStorage.getItem(this.KEYS.ARENA_ELO) || '1200', 10),
        unlockedCards: JSON.parse(localStorage.getItem(this.KEYS.UNLOCKED_CARDS) || '[]'),
        arenaLastRewardDate: localStorage.getItem(this.KEYS.ARENA_LAST_REWARD_DATE) || '',
        arenaLastEloReward: parseInt(localStorage.getItem(this.KEYS.ARENA_LAST_ELO_REWARD) || '0', 10)
      };

      // Generate checksum to prevent tampering
      const exportObject = {
        version: 2,
        exportedAt: new Date().toISOString(),
        data: progressData
      };

      // Simple but more tolerant checksum
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
        if (data.lastCompletedChapterIndex !== undefined) {
          localStorage.setItem(this.KEYS.CHAPTER_PROGRESS, data.lastCompletedChapterIndex.toString());
        }

        if (data.arenaElo !== undefined) {
          localStorage.setItem(this.KEYS.ARENA_ELO, data.arenaElo.toString());
        }

        if (data.unlockedCards) {
          localStorage.setItem(this.KEYS.UNLOCKED_CARDS, JSON.stringify(data.unlockedCards));
        }

        if (data.arenaLastRewardDate !== undefined) {
          localStorage.setItem(this.KEYS.ARENA_LAST_REWARD_DATE, data.arenaLastRewardDate);
        }

        if (data.arenaLastEloReward !== undefined) {
          localStorage.setItem(this.KEYS.ARENA_LAST_ELO_REWARD, data.arenaLastEloReward.toString());
        }

        alert('✅ Progress successfully imported!\n\nPlease refresh the page to apply changes.');

        // Optional: auto-refresh
        setTimeout(() => window.location.reload(), 1500);

      } catch (e) {
        console.error(e);
        alert('❌ Failed to import progress.\n\nMake sure you pasted the exact exported text.');
      }
    }

    // Simple but effective checksum
    private generateChecksum(data: any): string {
      const salt = "TESL_PROGRESS_2026";   // Change this if you want stronger protection
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

/*
Slot	Scenario type	Chance
1	None	90%
ProPlayer	5%
ProBoth	5%
weak (-500/-300)
2	None	90%
ProPlayer	5%
weak (-500/-300)
ProBoth	5%
3	None	50%
ProPlayer	50%
medium(-300/-100)
4	None	50%
ProBoth	50%
medium(-300/-100)
5	None	50%
ProAiMinor	50%
medium(-300/-100)
6	None	50%
ProAiMajor	50%
medium(-300/-100)
7	None	50%
ProAiMinor	25%
ProAiMajor	25%
strong(-100/+100)
8	None	50%
ProAiMinor	25%
ProAiMajor	25%
strong(-100/+100)
*/

/*

ch1
"Welcome to The Elder Scrolls: Legends. The object of the game is to defeat your opponent. You do this by playing cards from your deck."
Creatures can't attack on the turn they enter play.

ch4
"In this match you use the Mulligan redraw mechanic, and learn about the Charge and Lethal keywords. At the start of every match you can view the top three cards of your deck and decide to keep or redraw certain cards."
"Lethal creatures kill any creature they deal damage to."

ch5
"Your opponent comes to battle with defenses ready." 

ch7
"Boethiah's Cultists dart toward you." 

Game1.

General.VO1 (Ch1)
Reduce your opponent's health to zero to win
PlayerTurn1.VO1
Play your creature
PlayerTurn1.VO2 (Ch1)
Place the creature in the lane.
PlayerTurn2.RequiredAttackPlayer
You must attack an enemy creature.
PlayerTurn2.VO1
Attack one of their creatures with your Scuttler.
PlayerTurn2.VO2
When creatures battle, each damages the other.
PlayerTurn4.RequiredItem
Play Heavy Battleaxe.
PlayerTurn4.VO1 (Ch1)
You drew an item. Play heavy battleaxe to improve one of your creatures.
PlayerTurn6.RequiredAttack
Take the opportunity to finish your opponent now.
EndTurnWithPlaysAndAttacks
Play your card or attack.
EndTurnWithPlays
Play your card.
EndTurnWithAttacks
Attack with your creatures.
AITurn3.VO1 (Ch1)
When creatures fight, they deal damage equal to their power.


Game2.
General.VO1 (Ch1)
Most games have two lanes. Creatures can only attack enemy creatures in the same lane.
PlayerTurn1.VO1 (Ch1)
Choose a lane for your scuttler.
PlayerTurn2.VO1
When you deploy orc clansman, he will strengthen one of your creatures.
PlayerTurn2.VO2
Play your orc clansman now.
PlayerTurn2.VO3
Now, attack the Acolyte of Boethiah to take it out.
PlayerTurn4.VO2 (Ch2)
Summon Valenwood Huntsman to take out your opponent's creature.
PlayerTurn6.VO1 (Ch2)
Actions provide one-shot abilities.
PlayerTurn6.VO2
Your opponent is near defeat. Finsih him now.
PlayerTurn6.VO3
Attack your opponent.


Game3.
PlayerTurn1.VO2 (Ch2)
You will use magicka to play your cards.
PlayerTurn2.VO1 (Ch2)
Your magicka increases by one each turn.


Game4.
General.VO1 (ch3)
For every five health you lose, you'll lose a rune and draw a card.
General.VO2 (ch3)
Each time you lose a rune, you'll draw a card.
PlayerTurn3.VO1 (ch4)
Charge creatures can attack immediately.
playerturn2.tyr (ch3)
We're outnumbered. Let's take some of them out before they overwhelm us.

Game5.
AITurn3.ForcedProphecyPlay
Play your prophecy card.
AITurn3.VO1 (ch3)
If you draw a prophecy card when you lose a rune, you may play it for free. Drag the grahtwood ambusher to a lane.

Game6
PlayerTurn2.VO1 (Ch3)
Guards must be destroyed before you can attack other enemies in their lane.

Game7
PlayerTurn4.VO1 (ch3)
Support cards once played are permanent and provide ongoing benefits.
VO2 (Ch2)
Creatures played to a shadow lane gain cover for a turn. Creatures with cover can't be attacked.

Game9
Gamestart.elixir (Ch3)
When you go second, you start the game with a ring of magicka. Select it when you want to use it for a temporary magicka boost.
enemyturn1.pirate (ch9)
Look alive men. Or this storm will toss you about.
startofgame.swims (ch9)
I stole this cargo fair and square. Let's send these dishonorable thieves into the brine.

Game11
murkwatershamandraw.laaneth (ch11)
Be careful. These goblins had a powerful chief with them when I first arrived. We'd better finish off as many of them as we can before he comes back.
startofgame.laanethvo1
Thanks for the rescue
startofgame.laanethvo2
I think so, but if we're not careful, we will be too.
startofgame.tyr
Are all the cultists dead?

Game13
startofgame.laaneth
Why are they tring to kill us? Are they assassins? Dominion operatives?
startofgame.tyr
They're Nords. This is what we do for fun.

Game15
endofgame.swims
Great. Let's get out of here while they're collecting their winnings.
startofgame.tyr
Huh! Now here we go. Let's grab some weapons off the wall and get to work.

Game16
startofgame.laaneth
I sense mystical power within that altar. Perhaps it can quiet the dead.

Game19
endofgame.cassia
We're through. Come on. We've got to find Naarifin before it's too late.
startofgame.cassia
Alright troops. Our job is to take that gate and fast.

*/


/*

<div class="draft-sidebar">

      <!-- Stats -->
      <div class="stats-panel">
        <!--<h4>Draft Stats</h4>-->

        <!-- Mana Curve -->
        <div class="stat-section">
          <!--<label>Mana Curve</label>-->
          <div class="mana-curve">
            <div class="bar-container" *ngFor="let count of manaCurve; let i = index; trackBy: trackByIndex">
               <!-- <span class="value-label" *ngIf="count > 0">{{ count }}</span>-->
              <div class="bar-area">
                    <div class="bar" [style.height.%]="getBarHeight(count)">
                    <span class="value-label" *ngIf="count > 0">{{ count }}</span>
                    </div>
                </div>
                <span class="bar-label">{{ i === 7 ? '7+' : i }}</span>
            </div>
          </div>
        </div>

        <!-- Card Types -->
        <div class="stat-section">
          <!--<label>Card Types</label>-->
          <div class="type-counts">
            <div class="type" *ngFor="let type of ['Creature', 'Action', 'Item', 'Support', 'Prophecy']">
              <span class="type-name">{{ type }}</span>
              <span class="type-count">{{ typeCounts[type] || 0 }}</span>
            </div>
          </div>
        </div>

        <!-- Attributes -->
        <div class="stat-section">
          <!--<label>Attributes</label>-->
          <div class="attribute-counts">
            <div class="attr" *ngFor="let attr of getAttributeKeys()">
              <img [src]="attributeIcons[attr]" class="attr-icon" alt="">
              <span class="attr-count">{{ attributeCounts[attr] }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Current Deck -->
      <div class="current-deck-panel">
        <h4>Your Deck ({{ currentDeckTotal }}/30)</h4>
        <div class="deck-list">
          <div class="deck-entry" *ngFor="let card of draftDeck">
            <span class="cost">{{ card.cost }}</span>
            <span class="name">{{ card.name }}</span>
          </div>
        </div>
      </div>

    </div>
    */