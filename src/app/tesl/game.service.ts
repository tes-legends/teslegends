//game.service.ts
import { Injectable } from '@angular/core';
import { UtilityService } from './utility.service';
import { DeckService, GameState, PlayerState, Card, CardEffect
    , TargetType, HistoryEntry, AuraEffect, PendingAction
 } from './deck.service';
import { core } from '@angular/compiler';
import { skip } from 'rxjs';

export interface AttackAction {
  attacker: Card;
  target: Card | PlayerState;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {

  private readonly MAX_DEPTH = 12; 
  keywordList = ['Breakthrough', 'Charge', 'Drain', 'Guard', 'Lethal', 'Rally', 'Regenerate', 'Ward' ];

  constructor(private deckService: DeckService, private utilityService: UtilityService) {}

  startGame(game: GameState, cpu: boolean, deckO: string, deckP: string
    , handM: number, handC: number, anim: boolean, classic: boolean, overrides: any) {
    game.player = {
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
    };
    game.opponent = {
      health: 30,
        currentMagicka: 0,
        maxMagicka: handM,
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
    };
    game.laneTypes = ['Field','Shadow'];
    game.history = [];
    game.gameRunning = false;
    game.pendingActions = [];
    game.firstPlayer = Math.random() < 0.5 ? 'player' : 'opponent';
    game.currentRound = 0;
    game.currentTurn = 0;
    game.cpuPlaying = cpu;
    game.classicTargeting = classic;
    game.tempCostAdjustment = 0;
    game.targetLaneRequired = false;
    game.stagedCard = null;
    game.stagedAttack = null;
    game.stagedSummon = null;
    game.stagedSummonEffect = null;
    game.stagedProphecy = null;
    game.stagedSupportActivation = null;
    game.stagedAction = 'none';
    game.creatureSlain = null;
    game.creatureSlayer = null;
    game.creatureShackled = null;
    game.thief = null;
    game.creatureMoved = null;
    game.creatureRevealed = null;
    game.lastCardPlayed = null;
    game.lastCardDrawn = null;
    game.lastCardSummoned = null;
    game.lastCardSummoned2 = null;
    game.lastCardDealingDamage = null;
    game.lastCardReceivingDamage = null;
    game.lastCreatureTargeted = null;
    game.lastCardEquipped = null;
    game.lastDamageTaken = 0;
    game.lastHealingTaken = 0;
    game.healthJustGained=  0;
    game.isProcessingDeath = false;
    game.isProcessingEndOfTurn = false;
    game.waitingOnScry = false;
    game.waitingOnAnimation = false;
    game.useAnimation = anim
    game.simulating = false;

    
    const deckInfoP = this.deckService.getDeckInfo(deckP);
    const deckInfoO = this.deckService.getDeckInfo(overrides?.deckCode ?? deckO);
    if (deckInfoP?.cards) {      
        const oLength = deckInfoO!.cards.reduce((sum, c) => sum + c.count, 0);
        if (oLength < 30) {
          console.log(`Opponent deck length: ${oLength}. adding cards`);
          const scale = 30 / oLength;
          let newTotal = 0;
          if (oLength < 15) {
            deckInfoO!.cards.forEach(c => {
              c.count = Math.floor(c.count * scale);
              newTotal += c.count;
            });
          } else {
            newTotal = oLength;
          }
          if (newTotal < 30) {
            deckInfoO!.cards[deckInfoO!.cards.length - 1].count += (30 - newTotal);
          }
        }
        const pLength = deckInfoP.cards.reduce((sum, c) => sum + c.count, 0);
        if (pLength < 30) {
          console.log(`Player deck length: ${pLength}. adding cards`);
          const scale = 30 / pLength;
          let newTotal = 0;
          if (pLength < 15) {
            deckInfoP.cards.forEach(c => {
              c.count = Math.floor(c.count * scale);
              newTotal += c.count;
            });
          } else {
            newTotal = pLength;
          }
          if (newTotal < 30) {
            deckInfoP.cards[deckInfoP.cards.length - 1].count += (30 - newTotal);
          }
        }
        // Convert to full deck (with multiples)
        game.player.deck = [];
        deckInfoP.cards.forEach(entry => {
            for (let i = 0; i < entry.count; i++) {
            game.player.deck.push(this.deckService.cloneCardForGame(entry.card, false)); // clone card
            }
        });
        game.opponent.deck = [];
        deckInfoO!.cards.forEach(entry => {
            for (let i = 0; i < entry.count; i++) {
            game.opponent.deck.push(this.deckService.cloneCardForGame(entry.card, true)); // clone card
            }
        });

        let shufflePlayer = true;
        let shuffleOpponent = true;
        let startingHand = 3;

        if (overrides) {
          //console.log('starting game with overrides');
          if (overrides.playerdeck) {
            console.log('player deck override');
            game.player.deck = [];
            overrides.playerdeck.forEach((cardId: string) => {
              const card = this.deckService.getCardById(cardId);
              const cloned = this.deckService.cloneCardForGame(card!, false);
              game.player.deck.push(cloned);
            });
          }
          if (overrides.opponentdeck) {
            game.opponent.deck = [];
            overrides.opponentdeck.forEach((cardId: string) => {
              //console.log(`getting card: ${cardId}`);
              const card = this.deckService.getCardById(cardId);
              const cloned = this.deckService.cloneCardForGame(card!, true);
              game.opponent.deck.push(cloned);
            });
          }
          if (overrides.health) {
            game.player.health = overrides.health;
            game.opponent.health = overrides.health;
          }
          if (overrides.runes !== undefined && overrides.runes !== null) {
            game.player.runes = Array(5).fill(true).slice(0, overrides.runes);
            game.opponent.runes = Array(5).fill(true).slice(0, overrides.runes);
          }
          if (overrides.firstPlayer) {
            game.firstPlayer = overrides.firstPlayer;
          }
          if (overrides.lanes) {
            game.laneTypes = [...overrides.lanes];
          }
          if (overrides.board) {
            // Pre-place opponent board cards
            overrides.board.forEach((laneCards: string[], laneIdx: number) => {
              laneCards.forEach(cardId => {
                const card = this.deckService.getCardById(cardId);
                const cloned = this.deckService.cloneCardForGame(card!, true);
                if (cloned) {
                  cloned.laneIndex = laneIdx;
                  cloned.sick = false;
                  game.opponent.board[laneIdx].push(cloned);
                }
              });
            });
          }
          if (overrides.playerBoard) {
            // Pre-place opponent board cards
            overrides.playerBoard.forEach((laneCards: string[], laneIdx: number) => {
              laneCards.forEach(cardId => {
                const card = this.deckService.getCardById(cardId);
                const cloned = this.deckService.cloneCardForGame(card!, false);
                if (cloned) {
                  cloned.laneIndex = laneIdx;
                  cloned.sick = false;
                  game.player.board[laneIdx].push(cloned);
                }
              });
            });
          }
          if (overrides.support) {
            overrides.support.forEach((cardId: string) => {
              const card = this.deckService.getCardById(cardId);
              const cloned = this.deckService.cloneCardForGame(card!, true);
              if (cloned) {
                game.opponent.support.push(cloned);
                this.applyCardAuras(game, cloned, game.opponent);
              }
            });
          }
          if (overrides.playerSupport) {
            overrides.playerSupport.forEach((cardId: string) => {
              const card = this.deckService.getCardById(cardId);
              const cloned = this.deckService.cloneCardForGame(card!, false);
              if (cloned) {
                game.player.support.push(cloned);
                this.applyCardAuras(game, cloned, game.player);
              }
            });
          }
          if (overrides.cards !== undefined && overrides.cards !== null) startingHand = overrides.cards;
          if (overrides.forcedDraw) {
            console.log('forced draw');
            if (overrides.playerdeck) {
              shufflePlayer = false;
            }
            if (overrides.opponentdeck) {
              shuffleOpponent = false;
            }
          }
          if (overrides.maxMagicka) game.opponent.maxMagicka += overrides.maxMagicka;
          if (overrides.playerMaxMagicka) game.player.maxMagicka += overrides.playerMaxMagicka;
          if (overrides.special) {
            switch (overrides.special) {
              case 'summonRandomLowCost': {
                console.log('opponent summoning a random cheap creature from deck');
                const creaturesInDeck = game.opponent.deck.filter(c => 
                  c.type === 'Creature' && c.cost < 3);
                if (creaturesInDeck.length > 0) {
                  const chosenCreature = this.utilityService.random(creaturesInDeck);
                  const clonedCreature = this.deckService.cloneCardForGame(chosenCreature,true);
                  clonedCreature.sick = false;
                  let chosenLane = Math.random() < 0.5 ? 0 : 1;
                  if (game.laneTypes[chosenLane] === 'Disabled') chosenLane = 1 - chosenLane;
                  if (game.opponent.board[chosenLane].length < 4) game.opponent.board[chosenLane].push(clonedCreature);
                }
                break;
              }
              case 'shuffleRandomUniques': {
                console.log('shuffling 3 random unique creatures into each deck');
                const uniqueCards = this.deckService.getAllCards().filter(c => 
                  c.set !== 'Story Set' && c.deckCodeId !== null && c.unique && c.type === 'Creature'
                );
                for (let i = 0; i < 3; i++) {
                  const chosenUniqueP = this.utilityService.random(uniqueCards);
                  const cloneP = this.deckService.cloneCardForGame(chosenUniqueP,false);
                  game.player.deck.push(cloneP);
                  const chosenUniqueO = this.utilityService.random(uniqueCards);
                  const cloneO = this.deckService.cloneCardForGame(chosenUniqueO,false);
                  game.opponent.deck.push(cloneO);
                }
                break;
              }
            }
          }
        }
        console.log('shuffle player: ', shufflePlayer, ", shuffle opponent: ", shuffleOpponent);
        // === ADD RING OF MAGICKA TO OPPONENT'S SUPPORTS ===
        const secondPlayer = game.firstPlayer === 'player' ? game.opponent : game.player;
        const ringOfMagickaOriginal = this.deckService.getCardById('ring-of-magicka');
        if (ringOfMagickaOriginal) {
            secondPlayer.support.push(this.deckService.cloneCardForGame(ringOfMagickaOriginal, game.firstPlayer === 'player'));
        } else {
            console.warn('Ring of Magicka not found');
        }
    
        game.gameRunning = true;
        game.player.turn = false;
        game.opponent.turn = false;
        // Shuffle deck
        if (shufflePlayer) game.player.deck = this.utilityService.shuffle(game.player.deck);
        if (shuffleOpponent) game.opponent.deck = this.utilityService.shuffle(game.opponent.deck);
    
        // Draw starting hands (example: player 3 cards, opponent 4)
        this.drawCards(game.player, startingHand, game);
        this.drawCards(game.opponent, (startingHand + handC), game);
    
        console.log("Before mulligan - player hand:", game.player.hand.length);
    }
  }

  drawCards(player: PlayerState, count: number, game: GameState, full: boolean = false) {
    for (let i = 0; i < count; i++) {
      if (player.deck.length > 0) {
          player.cardsDrawn++;
          if (player.hand.length >= 10) {
            if (full) {
              console.log('hand full, stopping');
            } else {
              const cardBurned = player.deck.shift()!;
              game.lastCardDrawn = cardBurned;
              console.log(`burned ${cardBurned.name} because hand is full`);
              this.queuePendingAction(game, {
                  type: 'burn',
                  sourceCard: cardBurned,
                  opponentTarget: player === game.opponent
              });
            }
          } else {
            const card = player.deck.shift()!;
            card.currentCost = (card.currentCost ?? card.cost) + player.tempCost;
            game.lastCardDrawn = card;
            player.hand.push(card);
            this.runEffects('DrawCard', player, game);
            this.executeEffectsForCard('AddToHand',card, player, game);
          }
      } else if (!full) {
        // Deck empty → break a rune
        const intactRuneIndex = player.runes.findIndex(rune => rune === true);

        if (intactRuneIndex !== -1) {
          // Break one rune
          player.runes[intactRuneIndex] = false;
          console.log(`Deck empty — rune ${intactRuneIndex + 1} broken`);
          const ooc = this.getOutOfCards();
          this.queuePendingAction(game, {
              type: 'burn',
              sourceCard: ooc,
              opponentTarget: player === game.opponent
          });

          // Optional: trigger any "rune broken" effects
          this.runEffects('RuneBroken', player, game);

        } else {
          // No runes left → player loses
          console.log(`${player === game.player ? 'You' : 'Opponent'} has no runes left — game over!`);
          
          if (player === game.player) {
            this.handleGameOver(game, true);
            return;
          } else {
            this.handleGameOver(game, false);
            return;
          }          
        }
      }
    }
    this.reapplyHandAuras(player);
    this.updateStaticBuffs(game, player);
  }

  playCard(
      game: GameState,
      card: Card, 
      fromOpponent: boolean = false, 
      laneIndex?: number, 
      targetCard?: Card | PlayerState,
      isProphecy: boolean = false
  ) {
    const owner = fromOpponent ? game.opponent : game.player;
    const enemy = fromOpponent ? game.player : game.opponent;
    if (!isProphecy) {
      //if (fromOpponent || !this.player.turn) return;
      if (owner.currentMagicka < (card.currentCost ?? card.cost)) return;
      // Remove from hand
      const handIndex = owner.hand.indexOf(card);
      if (handIndex === -1) return;
      owner.hand.splice(handIndex, 1);
      //this.handVersion++;
      if ((card.currentCost ?? card.cost) > 0) owner.currentMagicka -= (card.currentCost ?? card.cost);      
    } else {
      const played = owner.deck.shift()!;
      console.log("Prophecy play — no cost, no turn requirement");
      // For prophecy, remove from stagedProphecy instead of hand
    }
    if (game.tempCostAdjustment !== 0) {
      owner.hand.forEach(cardInHand => {
          cardInHand.currentCost = (cardInHand.currentCost ?? cardInHand.cost ?? 0) - game.tempCostAdjustment;
      });
      game.tempCostAdjustment = 0;
    }
    if (!card.effects?.some(e => e.type === 'modCost' && e.target === 'self')) card.currentCost = card.cost;
    game.lastCardPlayed = card;

    // In playCard or opponentPlayCard
    this.logHistory(game,{
      player: card.isOpponent ? 'Opponent' : 'You',
      actionType: 'play-card',
      description: `${card.isOpponent ? 'Opponent' : 'You'} played ${card.name}`,
      details: card.type === 'Creature' ? [`To lane ${game.laneTypes[laneIndex!]}`] : []
    });

    // Put on board (for simplicity: always to left lane)
    const refType = this.deckService.getEffectiveType(card);
    switch (refType) {
      case 'Creature':
        if (laneIndex === undefined || laneIndex < 0 || laneIndex > 1) {
        console.warn('Creature needs a valid lane (0 or 1)');
        return;
        }

        const hasCharge = card.keywords?.includes('Charge') ?? false;
        const hasGuard  = card.keywords?.includes('Guard') ?? false;
        // Add to board with initialized runtime stats
        const creatureCopy: Card = {
        ...card,
        laneIndex: laneIndex,
        attachedItems: [],
        sick: hasCharge ? false: true, //charge gets 1 attack immediately
        attacks: 1, 
        covered: game.laneTypes[laneIndex] === 'Shadow' && !hasGuard &&
            !card.immunity?.includes('Cover')  // true in shadow lane unless Guard
        };
        const spendAll = card.effects?.some(e => 
          e.trigger === 'Play' && e.type === 'spendAllForStats'
        );
        if (spendAll) {
          const manaSpent = owner.currentMagicka;
          owner.currentMagicka = 0;
          creatureCopy.currentAttack! += manaSpent;
          creatureCopy.currentHealth! += manaSpent;
          creatureCopy.maxHealth! += manaSpent;
        }
        owner.board[laneIndex].push(creatureCopy);
        game.lastCardSummoned2 = game.lastCardSummoned;
        game.lastCardSummoned = creatureCopy;
        if (creatureCopy.covered) {
          creatureCopy.effects?.forEach(effect => {
            if (effect.trigger === 'GainCover') {
              this.executeEffect(effect, creatureCopy, game);
            }
          });
        }
        if (game.laneTypes[laneIndex] === 'Plunder') {
          const itemEffect: CardEffect = {
            "trigger": "Summon",
            "type": "equipRandom",
            "addKeywords": [],
            "removeKeywords": [],
            "target": "self"
          }
          this.executeEffect(itemEffect,creatureCopy,game,creatureCopy);
        }
        if (owner.numSummon == 0) {
            this.runEffects('SummonFirst',owner, game);
        }
        owner.numSummon++;
        this.runEffects('SummonCreature',owner, game);
        this.runEffects('SummonCreatureEnemy',enemy, game);

        this.applyCardAuras(game, creatureCopy, owner);

        if (!game.stagedSummon) {
          const summonEffects = creatureCopy.effects?.filter(e => e.trigger === 'Summon') || [];
          if (summonEffects.length > 0) {
              let allAuto = true;
              let hasValidTargets = true;
              summonEffects.forEach(effect => {
                  if (allAuto && !this.isAutoTarget(effect.target)) {
                      allAuto = false;                  
                      game.stagedSummonEffect = effect;                      
                  }
              });
              if (allAuto) {
                  //run all effects
                  summonEffects.forEach(effect => {
                      this.executeEffect(effect,creatureCopy, game);
                  });
              } else {
                  //stage summon
                  game.stagedSummon = creatureCopy;
                  if (!this.hasValidSummonTargets(game)) {
                      console.log(`No valid targets for summon effect of ${card.name} — auto-skipping`);
                      this.clearSummonTargeting(game);
                  } else {
                      console.log(`Manual summon targeting started for ${card.name}`);
                  }
              }
          }
          //console.log('staged effect is ', game.stagedSummonEffect);
        }

        break;
  
      case 'Item':
        if (this.isCard(targetCard!)) {
            // Find the target creature on player's board
            let found = false;
            let targetLane = -1;
            for (const lane of owner.board) {
                targetLane = lane.indexOf(targetCard);
                if (targetLane !== -1) {
                const creature = lane[targetLane];
    
                // Apply MODIFIERS from item (NOT card.attack/health)
                creature.currentAttack = (creature.currentAttack ?? 0) + (card.currentAttack ?? card.attack ?? 0);
                creature.currentHealth = (creature.currentHealth ?? 0) + (card.currentHealth ?? card.health ?? 0);
                creature.maxHealth = (creature.maxHealth ?? 0) + (card.currentHealth ?? card.health ?? 0);
    
                // Apply keywords from item
                this.addUniqueKeywords(creature,game, card.currentKeywords ?? card.keywords ?? []);
    
                const tempKeywordsToAdd = card.tempKeywords ?? [];
                this.addUniqueKeywords(creature,game,tempKeywordsToAdd);
                if (card.tempKeywords) {
                    creature.tempKeywords = Array.from(
                    new Set([
                        ...(creature.tempKeywords ?? []),
                        ...(tempKeywordsToAdd)
                    ])
                    );
                }
                if (card.immunity) {
                  creature.immunity = Array.from(
                    new Set([
                      ...(creature.immunity ?? []),
                      ...(card.immunity ?? [])
                    ])
                  );
                }
                card.laneIndex = creature.laneIndex;
    
                // Store the item reference
                creature.attachedItems = creature.attachedItems || [];
                creature.attachedItems!.push({ ...card });
                game.lastCardEquipped = card;
                this.runEffects('EquipFriendly',owner,game);
    
                creature.effects?.forEach(effect => {
                    if (effect.trigger !== 'EquipItem') return;
                    // Auto-target effects → resolve immediately
                    if (this.isAutoTarget(effect.target)) {
                    console.log('Equip Item triggered for: ', creature.name)
                    this.executeEffect(effect, creature, game);
                    } else {
                    console.log('no auto target for slay target: ', effect.target)
                    }
                });
    
                if (!game.stagedSummon) {
    
                    card.effects?.forEach(effect => {
                    if (effect.trigger !== 'Summon') return;
    
                    // Auto-target effects → resolve immediately
                    if (this.isAutoTarget(effect.target)) {
                        this.executeEffect(effect, card, game);
                    } else {
                        // Manual target required → stage it
                        game.stagedSummon = card;
                        game.stagedSummonEffect = effect;
                        if (!this.hasValidSummonTargets(game)) {
                        console.log(`No valid targets for summon effect of ${card.name} — auto-skipping`);
                        this.clearSummonTargeting(game);
                        } else {
                        console.log(`Manual summon targeting started for ${card.name}`);
                        }
                    }
                    });
                }
    
                found = true;
                console.log(`Applied ${card.name} to ${creature.name}: +${card.currentAttack ?? card.attack ?? 0}/${card.currentHealth ?? card.health ?? 0}`);
                break;
                }
            }
            if (!found) {
                console.warn('Target creature not found on board');
            }
            // Item goes to discard (graveyard) after being played
        } else {
            console.warn('Item needs a valid target card');
            return;
        }
        break;
  
      case 'Support':
        owner.support.push({ ...card });
        this.applyCardAuras(game, card, owner);
        if (!game.stagedSummon) {
          card.effects?.forEach(effect => {
            if (effect.trigger !== 'Summon') return;

            // Auto-target effects → resolve immediately
            if (this.isAutoTarget(effect.target)) {
              this.executeEffect(effect, card, game);
            } else {
              // Manual target required → stage it
              game.stagedSummon = card;
              game.stagedSummonEffect = effect;
              if (!this.hasValidSummonTargets(game)) {
                  console.log(`No valid targets for summon effect of ${card.name} — auto-skipping`);
                  this.clearSummonTargeting(game);
              } else {
                  console.log(`Manual summon targeting started for ${card.name}`);
              }
            }
          });
        }
        break;
  
      case 'Action':
        game.targetLaneRequired = false;
        const originalCard = this.deckService.getCardById(card.id);
        const freshCopy = this.deckService.cloneCardForGame(originalCard!, card.isOpponent || false);
        owner.discard.push(freshCopy);
        // Resolve Play effects (this is the new main path)
        card.effects?.forEach(effect => {
            if (effect.trigger !== 'Play') return;
            
            let laneTarget: number | undefined;
            if (laneIndex !== undefined) laneTarget = laneIndex;
            if (laneTarget === undefined && card.laneIndex) laneTarget = card.laneIndex;
            this.executeEffect(effect, card, game, targetCard, laneTarget);
        });
        if (card.effects?.some(e => e.trigger === 'EndOfTurn')) {
          console.log(`pushing ${card.name} to limbo`);
          owner.limbo.push(card);
        }
        owner.actionsPlayed++;
        break;
  
      default:
        console.warn(`Unknown card type: ${card.type}`);
    }
    owner.cardsPlayed++;
    const cardId = card.id;
    owner.playCounts[cardId] = (owner.playCounts[cardId] || 0) + 1;
    //console.log(`${owner === game.player ? 'Player' : 'Opponent'} played ${card.name} (${cardId}) — now played ${owner.playCounts[cardId]} times`);
    this.runEffects('PlayCard',owner, game);
    this.updateStaticBuffs(game,game.player);
    this.updateStaticBuffs(game,game.opponent);

    if (game.stagedProphecy !== null && game.stagedProphecy === card && game.stagedSummon === null) {
      console.log("Clearing staged prophecy after play");
      game.stagedProphecy = null;      
      this.logHistory(game,{
          player: 'You',
          actionType: 'prophecy-play',
          description: 'You played a Prophecy card from rune break!',
          details: [`Card: ${card.name}`]
      });
      //resume opponent turn
      this.breakRunesIfNeeded(game,owner);
      if (!game.stagedProphecy && !game.player.turn && game.cpuPlaying) {
          this.runOpponentTurn(game);
      }
    }
    // TODO: Trigger animations, etc.
  }

  private clearSummonTargeting(game: GameState) {
      game.stagedSummon = null;
      game.stagedSummonEffect = null;
      if (game.stagedProphecy !== null) {
        console.log("Clearing staged prophecy after play");
        game.stagedProphecy = null;
        //resume opponent turn
        this.breakRunesIfNeeded(game, game.player);
        if (!game.stagedProphecy && !game.player.turn && game.cpuPlaying) {
          this.runOpponentTurn(game);
        }
      }
  }

  private hasValidSummonTargets(game: GameState): boolean {
      if (!game.stagedSummon || !game.stagedSummonEffect) {
        return false;
      }
  
      const effect = game.stagedSummonEffect;
      const source = game.stagedSummon;
  
      // Use your existing getValidTargets to find candidates
      const possibleTargets = this.getValidTargets(game,
        effect.target as TargetType,
        source,
        source.laneIndex
      );
  
      // Filter using validation logic + exclude self
      const validTargets = possibleTargets.filter(target => {
        // Must pass the normal validation
        const isValid = this.isTargetValidForEffect(game,source, effect, target, source.laneIndex ?? 0);
  
        // Additional: exclude self (same instanceId)
        if (!game.classicTargeting && this.isCard(target) && target.instanceId === game.stagedSummon?.instanceId) {
          return false;
        }
  
        return isValid;
      });
  
      console.log(
        `Summon targets check for ${source.name}: ` +
        `${validTargets.length} valid targets found`
      );
  
      return validTargets.length > 0;
    }
  
    private applyCardAuras(game: GameState, card: Card, owner: PlayerState) {
      card.effects?.forEach(effect => {
        if (effect.trigger !== 'Aura') return;
        const target = effect.target;
        const isHandAura = target!.includes('Hand');
        const isAllHands = target === 'allHands';
        const isOpponentHand = target === 'opponentHand';
        //const enemy = owner === game.player ? game.opponent : game.player;
  
        const aura: AuraEffect = {
          sourcePlayer: owner === game.player ? 'player' : 'opponent',
          sourceInstanceId: card.instanceId!,
          sourceCard: card,
          sourceEffect: effect,
          type: effect.type,
          targetType: effect.target!,
          modAttack: effect.modAttack,
          modHealth: effect.modHealth,
          keywordsToAdd: effect.addKeywords,
          immunity: effect.immunity,
          amount: effect.amount ?? 0,
          targetFilter: isHandAura 
          ? this.deckService.createHandAuraTargetFilter(effect, card)
          : (effect.target === 'player' ? () => false 
          : this.deckService.createAuraTargetFilter(effect, card)),
          appliedTo: new Set<string>(),
          isPlayerAura: effect.target === 'player',
          isHandAura: isHandAura,
          affectsOpponentHand: isOpponentHand || isAllHands
        };

        const existingAura = owner.auras.find(a => 
          a.sourceInstanceId === card.instanceId &&
          a.sourceEffect === effect  // or compare relevant fields
        );
  
        if (!existingAura) {
          // Player-level aura → apply immediately and track
          if (aura.isPlayerAura) {
            this.applyPlayerAura(game, aura, owner);
          } else if (aura.isHandAura) {
            if (isOpponentHand) {
              if (owner === game.player) {
                this.applyHandAura(aura, game.opponent);
              } else {
                this.applyHandAura(aura, game.player);
              }
            } else if (isAllHands) {
              this.applyHandAura(aura, game.opponent);
              this.applyHandAura(aura, game.player);
            } else {
              this.applyHandAura(aura, owner);
            }
          }
          // Creature aura → normal handling
          else {
            this.applyAuraToExistingTargets(game, aura);
          }
          owner.auras.push(aura);
        }
      });
  
      // Apply existing auras to this new card (if it's a creature)
      if (card.type === 'Creature' || card.type === 'Support') {
        owner.auras.forEach(aura => {
          if (!aura.isPlayerAura && !aura.isHandAura && aura.targetFilter(card) && !aura.appliedTo.has(card.instanceId!)) {
            this.applyAuraEffectToTarget(aura, card, game);
            aura.appliedTo.add(card.instanceId!);
          }
        });
      }
    }

  getDebuffModifier(player: PlayerState): number {
    let modTotal = 0;
    player.board.forEach(lane => {
      lane.forEach(creature => {
        creature.effects?.forEach(effect => {
          if (effect.type === 'modifyDebuff') {
            modTotal += effect.amount ?? 0;
          }
        });
      });
    });
    return modTotal;
  }

  hasBreakthroughAura(player: PlayerState): boolean {
    console.log(player.auras);
    return player.auras.some(a => a.isPlayerAura && ((a.keywordsToAdd ?? []).includes('Breakthrough')));
  }

  hasDoubleMagickaAura(player: PlayerState): boolean {
    console.log(player.auras);
    return player.auras.some(a => a.isPlayerAura && ((a.keywordsToAdd ?? []).includes('DoubleMagicka')));
  }

  hasPilferSlayAura(player: PlayerState): boolean {
    return player.auras.some(a => a.isPlayerAura && a.type === 'pilferSlay');
  }

  getMagickaLimitAura(game: GameState): number {
    let magickaLimit = 99;
    [game.player, game.opponent].forEach(p => {
      p.auras.forEach(a => {
        if (a.isPlayerAura && a.type === 'magickaLimit' && a.amount) {
          magickaLimit = Math.min(a.amount,magickaLimit);
        }
      })
    });
    return magickaLimit;
  }

  hasActionImmunityAura(player: PlayerState): boolean {
    return player.auras.some(a => a.isPlayerAura && a.type === 'grantImmunity' && 
      a.immunity === 'ActionDamage');
  }

  hasSupportImmunityAura(player: PlayerState): boolean {
    return player.auras.some(a => a.isPlayerAura && a.type === 'grantImmunity' && 
      a.immunity === 'SupportDamage');
  }
  
  private applyPlayerAura(game: GameState, aura: AuraEffect, owner: PlayerState) {
    if (aura.type === 'maxMagicka') {
      const amount = aura.amount ?? 1;
      owner.maxMagicka += amount;
      this.runEffects('MaxMagickaIncreased',owner, game);
      this.updateStaticBuffs(game, owner);
      console.log(`${owner === game.player ? 'Player' : 'Opponent'} max magicka increased by ${amount} due to ${aura.sourceInstanceId}`);

    }
  }  
  
  reapplyHandAuras(player: PlayerState) {
      player.auras.forEach(aura => {
        if (aura.isHandAura) {
          player.hand.forEach(card => {
            if (aura.targetFilter?.(card) && !aura.appliedTo?.has(card.instanceId!)) {
              if (aura.type === 'modCost') {
                console.log(`applying existing aura to ${card.name} with amount ${aura.amount ?? 0}`);
                card.currentCost = (card.currentCost ?? card.cost ?? 0) + (aura.amount ?? 0);
                aura.appliedTo?.add(card.instanceId!);
              }
            }
          });
        }
      });
  }
  
    private applyHandAura(aura: AuraEffect, owner: PlayerState) {
      if (aura.type === 'modCost') {
        const amount = aura.amount ?? -1;  // usually negative
  
        owner.hand.forEach(cardInHand => {
          if (aura.targetFilter?.(cardInHand)) {
            // Apply reduction
            cardInHand.currentCost = (cardInHand.currentCost ?? cardInHand.cost ?? 0) + amount;
  
            // Track it (so we can revert when aura ends)
            if (!aura.appliedTo) aura.appliedTo = new Set();
            aura.appliedTo.add(cardInHand.instanceId!);
  
            console.log(`Hand aura: ${amount} cost to ${cardInHand.name} from ${aura.sourceInstanceId}`);
          }
        });
      }
    }  
  
    isAutoTarget(targetType: TargetType | undefined, sourceType?: string): boolean {
      if (!targetType) return true;
      if (sourceType && sourceType === 'Action') {
        if (['creatureEnemyThisLaneAll','creatureFriendlyThisLaneAll','creatureThisLaneAll'].includes(targetType)) {
          return false;
        }
      }
      const auto: TargetType[] = [
        'creatureAll',
        'self',
        'creatureEnemyAll',
        'creatureEnemyRandom',
        'creatureEnemyThisLaneAll',
        'creatureFriendlyRandom',
        'creatureFriendlyAll',
        'creatureFriendlyOtherAll',
        'creatureFriendlyOtherThisLaneAll',
        'creatureFriendlyThisLaneAll',
        'creatureOtherAll',
        'creatureOtherThisLaneAll',
        'creatureThisLaneAll',
        'creatureFriendlyOtherRandom',
        'creatureFriendlyRandomLeftLane',
        'creatureFriendlyRandomRightLane',
        'enemyAll',
        'enemyRandom',
        'creatureShackled',
        'opponent',
        'player',
        'players',
        'currentPlayer',
        'thisLane',
        'otherLane',
        'leftLane',
        'rightLane',
        'randomLane',
        'drawnCard',
        'summon',
        'moved',
        'thief',
        'slain',
        'slayer',
        'wielder',
        'lastCardUsed',
        'creatureDamaged',
        'creatureTopDeck',
        'supportFriendlyAll',
        'creatureDiscardAll',
        'cardPlayerHandRandom',
        'playerHand',
        'deck'
        // Add more as you define them
      ];
  
      return auto.includes(targetType);
    }
  
    isTargetValidForEffect(game: GameState, source: Card, effect: CardEffect, target: Card | PlayerState, laneIndex: number): boolean {
      const expected = effect.target;
      if (!expected) return false;
      if (source.type === 'Action' && this.isCard(target) &&
        source.isOpponent !== target.isOpponent && 
        (target.immunity?.includes('ActionTarget') ||
        target.currentKeywords?.includes('Camouflage'))) return false;

      if (source.type === 'Creature' && source.subtypes.includes('Dragon') && this.isCard(target) &&
        (target.immunity?.includes('Dragons'))) return false;
  
      if (effect.targetCondition && this.isCard(target)) {
        if (!this.deckService.isTargetConditionMet(target,effect.targetCondition,source)) {
          return false;
        }
      }

      if (game.stagedAction === 'choice-followup' && source === target) {
        if (!source.targetReq) {
          return false;
        }
      }
  
      if (expected.includes('ThisLane') && source.laneIndex !== undefined) {
        laneIndex = source.laneIndex;
      }

      if (expected.endsWith('Hand')) {
        switch (expected) {
          case 'creaturePlayerHand':
            return (this.isCard(target) && target.type === 'Creature' && 
            (target.laneIndex === undefined || target.laneIndex === null));
          case 'cardPlayerHand':
            return (this.isCard(target) && target !== source && this.isCardInHand(game, target));
          default:
            return false;
        }
      } else if (this.isCard(target) && this.isCardInHand(game,target)) {
        return false;
      }
      //console.log('checking targets for summon');
      switch (expected) {
        // Single creature targets
        case 'creature':
          return this.isCard(target) && target.type === 'Creature';
        case 'creatureWounded':
          return this.isCard(target) && target.type === 'Creature' && this.deckService.isWounded(target);
        case 'creatureEnemy':
          return this.isCard(target) && target.type === 'Creature' && target.isOpponent !== source.isOpponent;
        case 'creatureEnemyWounded':
          return this.isCard(target) && target.type === 'Creature' && target.isOpponent !== source.isOpponent && this.deckService.isWounded(target);
        case 'creatureFriendly':
          return this.isCard(target) && target.type === 'Creature' && target.isOpponent === source.isOpponent;
        case 'creatureOther': {
          if (source.type === 'Item') {
            const newSource = this.findWielderOfItem(game, source);
            if (newSource) {
              return this.isCard(target) && target.type === 'Creature' && target.instanceId !== newSource.instanceId;
            } else {
              return false;
            }
          } else {
            return this.isCard(target) && target.type === 'Creature' && target.instanceId !== source.instanceId;
          }
        }
        case 'creatureThisLane':
          return this.isCard(target) && target.type === 'Creature' && target.laneIndex === laneIndex;
        case 'creatureEnemyThisLane':
          return this.isCard(target) && target.type === 'Creature' && target.laneIndex === laneIndex && target.isOpponent !== source.isOpponent;
        case 'creatureFriendlyOtherThisLane':
          return this.isCard(target) && target.type === 'Creature' && 
          target.laneIndex === laneIndex && target.isOpponent === source.isOpponent && target.instanceId !== source.instanceId;
        case 'creatureFriendlyOther':
          return this.isCard(target) && target.type === 'Creature' && 
          target.isOpponent === source.isOpponent && target.instanceId !== source.instanceId;
        case 'creatureFriendlyThisLane':
          return this.isCard(target) && target.type === 'Creature' && 
                target.isOpponent === source.isOpponent && target.laneIndex === laneIndex;
        case 'any':
          return true;
        // Player / face
        case 'players':
          return target === game.player || target === game.opponent;
        case 'opponent':
          return target === (source.isOpponent ? game.player : game.opponent);
        case 'player':
          return target === (source.isOpponent ? game.opponent : game.player);
        case 'currentPlayer':
          return (target === game.player && game.player.turn) || (target === game.opponent && game.opponent.turn);
        case 'supportEnemy':
          return (this.isCard(target) && target.type === 'Support' && this.isCardOnSupport(game,target) && target.isOpponent !== source.isOpponent);
        case 'creatureSupportEnemy':
          return (this.isCard(target) && 
          ((target.type === 'Support' && this.isCardOnSupport(game,target)) || 
          target.type === 'Creature') && 
          target.isOpponent !== source.isOpponent);
        case 'creaturePlayerHand':
          return (this.isCard(target) && target.type === 'Creature' && 
          (target.laneIndex === undefined || target.laneIndex === null));
        case 'cardPlayerHand':
          return (this.isCard(target) && this.isCardInHand(game, target));
        // Lane
        case 'lane':
        case 'otherLane':
          // Usually needs lane click → validate laneIndex
          return laneIndex >= 0 && laneIndex <= 1;
  
        // Mass / random / auto effects — should never reach here (handled by isAutoTarget)
        default:
          console.warn(`Unhandled target type in isTargetValidForEffect: ${expected}`);
          return false;
      }
    }
  
    private getAutoTarget(game: GameState, targetType: TargetType, sourceCard: Card
      , effect?: CardEffect
    ): Card | PlayerState | null {
      let isPlayerTurn = game.player.turn;
      if (sourceCard && targetType !== 'currentPlayer') {
        isPlayerTurn = !sourceCard.isOpponent;
      }
      const owner = sourceCard && sourceCard.isOpponent ? game.opponent : game.player;
      switch (targetType) {
        case 'self':
          return sourceCard;
        case 'opponent':
          return isPlayerTurn ? game.opponent : game.player;
        case 'player':
          return isPlayerTurn ? game.player : game.opponent;
        case 'currentPlayer':
          return isPlayerTurn ? game.player : game.opponent;
        case 'deck':
          return this.utilityService.random(owner.deck);
        case 'creatureEnemyRandom':
          const enemies = isPlayerTurn ? this.getEnemyCreatures(game) : this.getPlayerCreatures(game);
          return enemies.length > 0 ? this.utilityService.random(enemies) : null;
        case 'creatureFriendlyRandom':
          const friendlies = isPlayerTurn ? this.getPlayerCreatures(game) : this.getEnemyCreatures(game);
          return friendlies.length > 0 ? this.utilityService.random(friendlies) : null;
        case 'creatureFriendlyOtherRandom': {
          const friendlies2 = isPlayerTurn ? this.getPlayerCreatures(game) : this.getEnemyCreatures(game);
          const filtered = friendlies2.filter(c =>
            !sourceCard || c.instanceId !== sourceCard.instanceId
          );
          return filtered.length > 0 ? this.utilityService.random(filtered): null;
        }
        case 'creatureFriendlyRandomLeftLane': {
          const friendlies2 = isPlayerTurn ? this.getPlayerCreatures(game) : this.getEnemyCreatures(game);
          const filtered = friendlies2.filter(c =>
            c.laneIndex === 0
          );
          return filtered.length > 0 ? this.utilityService.random(filtered): null;
        }
        case 'creatureFriendlyRandomRightLane': {
          const friendlies2 = isPlayerTurn ? this.getPlayerCreatures(game) : this.getEnemyCreatures(game);
          const filtered = friendlies2.filter(c =>
            c.laneIndex === 1
          );
          return filtered.length > 0 ? this.utilityService.random(filtered): null;
        }
        case 'enemyRandom':
          // Random enemy creature or player
          const all = isPlayerTurn ? [...this.getEnemyCreatures(game), game.opponent] :
            [...this.getPlayerCreatures(game), game.player];
          console.log('number of enemy targets is: ',all.length);
          return this.utilityService.random(all);
        case 'creatureTopDeck':            
          const topCreature = owner.deck.find(card => card.type === 'Creature');
          return topCreature || null;
        case 'cardPlayerHandRandom':
          let validCards = owner.hand;
          console.log(`cards in hand: ${validCards.length}`);
          if (effect?.subtypes?.length) {
            const normalizedSubtypes = effect.subtypes.map(s => s.trim());
            const requestedTypes = normalizedSubtypes.filter(t =>
              ["Creature", "Item", "Support", "Action"].includes(t)
            );
            const requestedSubtypes = normalizedSubtypes.filter(t =>
              !["Creature", "Item", "Support", "Action"].includes(t)
            );
            if (requestedTypes?.length) {
              validCards = validCards.filter(card => 
                requestedTypes.includes(card.type)
              );
            } 
            if (requestedSubtypes?.length) {
              validCards = validCards.filter(card => 
                requestedSubtypes.some(sub => card.subtypes!.includes(sub))
              );
            }
            console.log(`cards: ${validCards.length} after filtering for ${effect.subtypes}`);
          }
          return validCards.length > 0 ? this.utilityService.random(validCards) : null;
        // Add more auto cases...
        default:
          console.warn(`Auto-target not implemented for ${targetType}`);
          return null;
      }
    }
  
    isAttackConditionMet(condition?: Card['attackCondition'], laneIndex?: number, player?: PlayerState): boolean {
      if (!condition) {
        return true; // no condition = always allowed
      }
  
      switch (condition.type) {
        case 'thisLaneFull':
          if (player!.board[laneIndex!].length === 4) {
            return true;
          } else {
            return false;
          }
        default:
          console.warn(`Unknown targetCondition type: ${condition.type}`);
          return false; // safe default
      }
    }
  
    isPlayConditionMet(condition?: Card['playCondition'], player?: PlayerState): boolean {
      if (!condition) {
        return true; // no condition = always allowed
      }
  
      switch (condition.type) {
        case 'friendlyCreatureInEachLane':
          if (player!.board[0].length > 0 && player!.board[1].length > 0) {
            return true;
          } else {
            return false;
          }
        default:
          console.warn(`Unknown targetCondition type: ${condition.type}`);
          return true; // safe default
      }
    }
  
    private isConditionMet(
      game: GameState,
      effect: CardEffect,
      condition: CardEffect['condition'], 
      sourceCard: Card, 
      target?: (Card | PlayerState)
    ): boolean {
      if (!condition) return true; // No condition = always true
  
      const owner = sourceCard.isOpponent ? game.opponent : game.player;
      const enemy = sourceCard.isOpponent ? game.player : game.opponent;
      const allowedSubtypes = condition.subtypes ?? [];
      switch (condition.type) {
        case 'counter': {
          const minCount = condition.min ?? 0;
          const maxCount = condition.max ?? 99;
          const refCount = sourceCard.counter ?? 0;
          return refCount >= minCount && refCount <= maxCount;
        }          
        case 'lanesFull': 
          return owner.board[0].length === 4 && owner.board[1].length === 4;
        case 'playedActions':
          return owner.actionsPlayed >= (condition.min ?? 1);
        case 'isFirstTurn':
          return game.currentTurn <= 2;
        case 'numActivations':
          return (sourceCard.activations ?? 0) >= (condition.min ?? 1);

        case 'isAlive': 
          return sourceCard.type === 'Creature' && (sourceCard.currentHealth ?? 0) > 0;
  
        case 'creatureAlive':
          return this.isCardOnBoard(game, game.lastCreatureTargeted!);
          
        case 'creatureDied':
          const minDeaths = condition.min ?? 1;
          console.log(`number deaths is : ${(owner.diedLane[0] + owner.diedLane[1] +
          enemy.diedLane[0] + enemy.diedLane[1])}`);
          return (owner.diedLane[0] + owner.diedLane[1] +
            enemy.diedLane[0] + enemy.diedLane[1]) >= minDeaths;
          
        case 'creatureFriendlyDied':
          const minFriendlyDeaths = condition.min ?? 0;
          console.log(`number deaths is : ${(owner.diedLane[0] + owner.diedLane[1])}`)
          return (owner.diedLane[0] + owner.diedLane[1]) >= minFriendlyDeaths;
  
        case 'targetNotOnBoard':
          // If no target was provided → condition can't be evaluated → false
          if (!target || !this.isCard(target)) {
            console.warn('targetNotOnBoard condition used without a valid target card');
            return false;
          }
          // Check if the target card is no longer on any board
          const isStillOnBoard = this.isCardOnBoard(game, target as Card);
          return !isStillOnBoard;
  
        case 'tgtHasKeyword':
          if (!target || !this.isCard(target)) {
            console.warn('tgtHasKeyword condition used without a valid target card');
            return false;
          }
          if (!condition.keyword) return false;
          return (target.currentKeywords ?? []).includes(condition.keyword);
        
        case 'hasNotKeyword':
          return !(sourceCard.currentKeywords ?? []).includes(condition.keyword!);

        case 'discardHasSubtype':
          const discardCount = owner.discard
          .filter(card => card.subtypes?.some(sub => allowedSubtypes.includes(sub))).length;
          return discardCount > 0;
  
        case 'topDeckAttribute':
          if (owner.deck.length === 0) return false;
          const topCard = owner.deck[0];
          return topCard?.attributes?.includes(condition.attribute ?? '') ?? false;
  
        case 'attributeCount':
          const attribute = condition.attribute;
          const min = condition.min ?? 0;
          if (!attribute) {
            console.warn("attributeCount condition missing 'attribute'");
            return false;
          }
          const matchingCount = owner.board[0]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.attributes?.includes(attribute)
          ).length + owner.board[1]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.attributes?.includes(attribute)
          ).length;
          const result = matchingCount >= min;
  
          console.log(
            `attributeCount check: ${matchingCount} friendly ${attribute} creatures (need >= ${min}) → ${result}`
          );
  
          return result;    
        
        case 'woundedThisLane':
          let laneIndex = 0;
          if (effect.target === 'leftLane') {
            laneIndex = 0;
          } else if (effect.target === 'rightLane') {
            laneIndex = 1;
          } else {
            laneIndex = sourceCard.laneIndex!;
          }
          return enemy.board[laneIndex ?? 0]
          .filter(creature =>
            this.deckService.isWounded(creature)
          ).length > 0;
  
        case 'totalDmgByCard':
          const minDmg = condition.min ?? 0;
          return (sourceCard.totalDamageDealt ?? 0) >= minDmg;
          break;
  
        case 'hasHigherAttack':
          if (target && this.isCard(target)) {
            const refAttack = target.currentAttack!;
            const ownerTarget = target.isOpponent ? game.opponent : game.player;
            const ownerEnemy = target.isOpponent ? game.player : game.opponent;
            const matchingCount = ownerEnemy.board[0]
            .filter(creature =>
              creature.type === 'Creature' && creature.currentAttack! > refAttack
            ).length + ownerEnemy.board[1]
            .filter(creature =>
              creature.type === 'Creature' && creature.currentAttack! > refAttack
            ).length
            return matchingCount > 0;
          } else {
            return false;
          }
          
        case 'enemyCreatureInSameLane':
          if (sourceCard.laneIndex === undefined) return false;
          return enemy.board[sourceCard.laneIndex!].length > 0;
  
        case 'hasSubtype':
          if (!condition.subtypes?.length) return false;  
          let refCard: Card | undefined;        
          if (effect.trigger === 'PlayCard' && game.lastCardPlayed) {
            refCard = game.lastCardPlayed;
          } else if (effect.trigger === 'SummonCreature' && game.lastCardSummoned) {
            refCard = game.lastCardSummoned;
          } else if (effect.trigger === 'DrawCard' && game.lastCardDrawn) {
            refCard = game.lastCardDrawn;
          } else if (effect.trigger === 'Slay' && game.creatureSlain) {
            refCard = game.creatureSlain;
          } else {
            return false;
          }
          if (["Creature", "Item", "Support", "Action"].includes(condition.subtypes[0])) {
            return allowedSubtypes.includes(refCard.type);
          } else {
            return refCard.subtypes?.some(sub => allowedSubtypes.includes(sub));
          }              
  
        case 'summonAttribute':
          if (!condition.attribute) return false;
          return game.lastCardSummoned!.attributes.some(sub =>
            sub.includes(condition.attribute!));
          
        case 'hasInHand':
          if (allowedSubtypes.length > 0) {
            //console.log('checking subtypes: ', allowedSubtypes);
            return owner.hand.some(card => allowedSubtypes.includes(card.type));
          } else if (condition.attribute) {
            //console.log('checking attribute ', condition.attribute);
            return owner.hand.some(card => card.attributes.includes(condition.attribute!));
          } else {
            return false;
          }          
  
        case 'topDeckType':
          if (owner.deck.length === 0) return false;
          return allowedSubtypes.includes(owner.deck[0].type);
          
        case 'hasMoreHealth':
          return owner.health > enemy.health;
  
        case 'hasLessHealth':
          return owner.health < enemy.health;        
  
        case 'hasDestroyedRune':
          return enemy.runes.some(rune => !rune);
  
        case 'handEmpty':
          return owner.hand.length === 0;
  
        case 'hasFewerCards':
          return owner.hand.length < enemy.hand.length;
  
        case 'hasOtherOnBoard':
          return (owner.board[0]
            .filter(c => c.subtypes.some(s => allowedSubtypes.includes(s))).length + 
            owner.board[1]
            .filter(c => c.subtypes.some(s => allowedSubtypes.includes(s))).length) > 1; // >1 means others exist
        
        case 'drawnCardCost':
          return game.lastCardDrawn!.cost >= (condition.min ?? 0);
  
        case 'noDamageTaken':
          return owner.damageTaken <= 0;
  
        case 'maxMagicka':
          const minMagicka = (condition.min ?? 0);
          const maxMagicka = (condition.max ?? 20);
          return owner.maxMagicka >= minMagicka && owner.maxMagicka <= maxMagicka;
  
        case 'lastSummonCost':
          const minCost = (condition.min ?? 0);
          const maxCost = (condition.max ?? 20);
          const lastSummonCost = game.lastCardSummoned!.cost;
          return lastSummonCost >= minCost && lastSummonCost <= maxCost;

        case 'lastSummonAttack':
          const minAttack = (condition.min ?? 0);
          const maxAttack = (condition.max ?? 20);
          const lastSummonAttack = game.lastCardSummoned!.currentAttack!;
          return lastSummonAttack >= minAttack && lastSummonAttack <= maxAttack;

        case 'lastSummonHealth':
          const minHealth = (condition.min ?? 0);
          const maxHealth = (condition.max ?? 20);
          const lastSummonHealth = game.lastCardSummoned!.currentHealth!;
          return lastSummonHealth >= minHealth && lastSummonHealth <= maxHealth;
        
        case 'numCreatures':
          const matchingNum = owner.board[0]
          .filter(creature => 
            (!condition.attribute || creature.attributes?.includes(condition.attribute)) &&
            (!condition.keyword || creature.currentKeywords?.includes(condition.keyword))
          ).length + owner.board[1]
          .filter(creature => 
            (!condition.attribute || creature.attributes?.includes(condition.attribute)) &&
            (!condition.keyword || creature.currentKeywords?.includes(condition.keyword))
          ).length;
          return matchingNum >= (condition.min ?? 0);
        
        case 'lastPlayedCost':
          const minPlayedCost = (condition.min ?? 0);
          const maxPlayedCost = (condition.max ?? 20);
          const lastPlayedCost = game.lastCardPlayed!.cost;
          return lastPlayedCost >= minPlayedCost && lastPlayedCost <= maxPlayedCost;
  
        default:
          console.warn(`Unhandled condition type: ${condition.type}`);
          return false;
      }
    }
  
    destroyCard(game: GameState, card: Card, source?: Card | string) {
      if (!card?.instanceId) {
        console.warn("Cannot destroy card without instanceId");
        return;
      }
  
      const owner = card.isOpponent ? game.opponent : game.player;
      const location = this.findCardLocation(game, card);
  
      if (!location) {
        console.warn(`Card ${card.name} (${card.instanceId}) not found in any location`);
        return;
      }
      if (card.type === 'Creature') owner.diedLane[card.laneIndex!]++;
      const lastGaspShuffle = card.effects?.some(e => e.trigger === 'LastGasp' && 
          e.type === 'shuffleIntoDeck' && e.target === 'self');
      if (card.banished) {
        console.log('skipping discard for banish tag');
      } else if (lastGaspShuffle) {
        console.log('skipping discard for shuffle tag');
      } else {
        const originalCard = this.deckService.getCardById(card.id);
        const freshCopy = this.deckService.cloneCardForGame(originalCard!, card.isOpponent!);
        owner.discard.push(freshCopy);
      }
      this.logHistory(game,{
        player: card.isOpponent ? 'Opponent' : 'You',
        actionType: 'death',
        description: `${card.isOpponent ? 'Opp' : 'You'}: ${card.name}`,
        details: source ? [`Source: ${typeof source === 'string' ? source : source.name}`] : []
      });
      if (card.type === 'Creature' && card.attachedItems?.length) {
        card.attachedItems.forEach(item => {
          const originalItem = this.deckService.getCardById(item.id);
          const freshItem = this.deckService.cloneCardForGame(originalItem!, item.isOpponent || false);
          owner.discard.push(freshItem);     
        });
      }
  
      // 1. Remove from location
      switch (location.type) {
        case 'board':
          const lane = owner.board[location.laneIndex!];
          const idx = lane.indexOf(card);
          if (idx !== -1) {
            lane.splice(idx, 1);
          }
          break;
  
        case 'support':
          const supportIdx = owner.support.indexOf(card);
          if (supportIdx !== -1) {
            owner.support.splice(supportIdx, 1);
          }
          break;
  
        case 'hand':
          const handIdx = owner.hand.indexOf(card);
          if (handIdx !== -1) {
            owner.hand.splice(handIdx, 1);
            //this.handVersion++;
          }
          break;
  
        case 'deck':
          // Rare — but possible (e.g. banish from deck)
          const deckIdx = owner.deck.indexOf(card);
          if (deckIdx !== -1) {
            owner.deck.splice(deckIdx, 1);
          }
          break;
  
        default:
          //console.warn(`Unknown location for destroyed card: ${location.type}`);
      }
  
      // 2. Clean up auras this card was providing
      // Remove auras this creature owned
      this.reverseAurasOnTarget(game,card);
  
      // 3. Trigger death effects (Last Gasp, Slay triggers on source, etc.)
      if (card.type === 'Creature' && card.laneIndex !== undefined) {
        this.triggerDeathEffects(game, card, source);
        this.runEffects('CreatureFriendlyDeath',owner, game);
        const oppPlayer = owner === game.player ? game.opponent : game.player;
        this.runEffects('CreatureEnemyDeath',oppPlayer, game);
        [game.player, game.opponent].forEach(p => {
          p.board[card.laneIndex!].forEach((creature) => {
            creature.effects?.forEach(effect => {
              if (effect.trigger !== 'CreatureDeathThisLane') return;
              if (this.isAutoTarget(effect.target)) {
                console.log('CreatureDeathThisLane triggered for:', creature.name);
                this.executeEffect(effect, creature, game);
              } else {
                console.log('No auto target for CreatureDeathThisLane:', effect.target);
                // TODO: handle manual target selection for Last Gasp (rare)
              }
            });
          });
        });
      }
      this.updateStaticBuffs(game,game.player);
      this.updateStaticBuffs(game,game.opponent);
    }
  
    private triggerDeathEffects(game: GameState, destroyedCard: Card, source?: Card | string) {
      // === 1. Trigger Last Gasp on the destroyed card itself ===
      destroyedCard.effects?.forEach(effect => {
        if (effect.trigger === 'LastGasp') {

          this.queuePendingAction(game, {
              type: 'audio',
              sourceCard: destroyedCard,
              prompt: 'lastgasp'
          });
          console.log(`Last Gasp triggered for: ${destroyedCard.name}`);
  
          // Auto-target effects run immediately
          if (this.isAutoTarget(effect.target)) {
            this.executeEffect(effect, destroyedCard, game);
          } else {
            console.log(`No valid target for Last Gasp on ${destroyedCard.name}`);
          }
        }
      });
  
      // Also trigger Last Gasp on attached items if they had any
      destroyedCard.attachedItems?.forEach(item => {
        item.effects?.forEach(effect => {
          if (effect.trigger !== 'LastGasp') return;
          if (this.isAutoTarget(effect.target)) {
            console.log('Last Gasp triggered for attached item:', item.name);
            this.executeEffect(effect, item, game);
          }
        });
      });
    }
  
  private findCardLocation(game: GameState, card: Card): 
      { type: 'board', laneIndex: number } | 
      { type: 'support' } | 
      { type: 'hand' } | 
      { type: 'deck' } | 
      null 
  {
      const owner = card.isOpponent ? game.opponent : game.player;
  
      // Board
      for (let laneIndex = 0; laneIndex < 2; laneIndex++) {
        if (owner.board[laneIndex].includes(card)) {
          return { type: 'board', laneIndex };
        }
      }
  
      // Support
      if (owner.support.includes(card)) {
        return { type: 'support' };
      }
  
      // Hand
      if (owner.hand.includes(card)) {
        return { type: 'hand' };
      }
  
      // Deck
      if (owner.deck.includes(card)) {
        return { type: 'deck' };
      }
  
      return null;
  }

  endTurn(game: GameState) {
      if (/*this.mulliganActive ||*/ !game.gameRunning) return;
      if (!game.player.turn && !game.opponent.turn) {
        //first turn of game
        if (game.firstPlayer == 'opponent') {
          game.player.turn = true;
        }
      }  
      if (game.currentTurn === 0) {
        console.log('Running start of game effects');
        this.runEffects('StartOfGame', game.player, game);
        this.runEffects('StartOfGame', game.opponent, game);
      }  
      game.currentTurn++;
      if (game.currentTurn % 2 === 1) {
        game.currentRound++;
      }
      const prevPlayer = game.player.turn ? game.player : game.opponent;
      const nextPlayer = game.player.turn ? game.opponent : game.player;
      this.handleLimbo(game);
      this.clearEndOfTurnEffects(prevPlayer, game);
      console.log(prevPlayer.diedLane);
      this.runEffects('EndOfTurn',prevPlayer, game);
      this.runEffects('EndOfEachTurn',game.player, game);
      this.runEffects('EndOfEachTurn',game.opponent, game);
      this.resetTemporaryEffects(game);
      prevPlayer.turn = false;
      nextPlayer.turn = true;
      this.resetTurnPlayer(game, nextPlayer);
      this.updateStaticBuffs(game, game.player);
      this.updateStaticBuffs(game, game.opponent);
      this.runEffects('StartOfTurn',nextPlayer, game);
      this.runEffects('StartOfEachTurn',game.player, game);
      this.runEffects('StartOfEachTurn',game.opponent, game);
      this.resetTurnStats(game.opponent);
      this.resetTurnStats(game.player);   
      this.checkReturn(game, nextPlayer); 
      if (!game.waitingOnScry) this.drawCards(nextPlayer,1,game);         
      this.queuePendingAction(game, {
          type: 'history'
      });   
      if (game.cpuPlaying && nextPlayer === game.opponent) this.runOpponentTurn(game); 
  }

  private handleLimbo(game: GameState) {
    [game.player, game.opponent].forEach(player => {
      player.limbo.forEach(card => {
        console.log(`processing limbo card: ${card.name}`);
        if (card.type === 'Action') {
          card.effects?.forEach(effect => {
            if (effect.trigger !== 'EndOfTurn') return;
            // Auto effects
            //console.log(`running effect type ${effect.type}`);
            if (this.isAutoTarget(effect.target)) {
              this.executeEffect(effect, card, game, undefined, undefined);
            } else {
              // Manual target (find one using AI logic)
              const aiTarget = this.getActionTarget(game, card, effect, true);
              if (aiTarget) {
                this.executeEffect(effect, card, game, aiTarget, undefined);
              } else {
                console.log(`No valid target for opponent Action effect: ${effect.type}`);
              }
            }
          });
        } else if (card.type === 'Creature') {
          if (player.board[card.laneIndex!].length < 4) {
            player.board[card.laneIndex!].push(card);
            this.applyCardAuras(game, card, player);      
            card.effects?.forEach(effect => {
              if (effect.trigger !== 'Summon') return;
              if (effect.type === 'blink') {
                console.log(`can't blink on blink return`);
                return;
              }
              if (this.isAutoTarget(effect.target)) {
                this.executeEffect(effect, card, game);
              } else {
                // Manual target → AI chooses intelligently
                const aiTarget = this.getSummonTarget(game, effect, card, card.isOpponent!);
                if (aiTarget) {
                  this.executeEffect(effect, card, game, aiTarget);
                  console.log(`Automatically chose summon target: ${(aiTarget as any).name || 'face'}`);
                } else {
                  console.log(`No valid summon target for: ${card.name}`);
                }
              }
            });
          }
        }
      });
      player.limbo = [];
    });
    
  }

  private resetTemporaryEffects(game: GameState) {
    [game.player, game.opponent].forEach(player => {
      player.board.forEach(lane => {
        lane.forEach(creature => {
          if (creature.effects) {
            // Filter out temporary effects
            const beforeCount = creature.effects.length;
            creature.effects = creature.effects.filter(effect => !effect.temporary);
            const removed = beforeCount - creature.effects.length;
            if (removed > 0) {
              console.log(`Cleared ${removed} temporary effect(s) from ${creature.name}`);
            }
          }
        });
      });
    });              
  }
  
  private resetTurnStats(player: PlayerState) {
      //console.log(`resetting stats from died lane 0: ${player.diedLane[0]}, lane 1: ${player.diedLane[1]}, dmgTaken: ${player.damageTaken}`);
      player.diedLane = [0, 0];
      player.damageTaken = 0;
      player.numSummon = 0;
      player.actionsPlayed = 0;
      player.cardsPlayed = 0;
      player.cardsDrawn = 0;
  }
  
    private getAmountPer(game: GameState, type: string, card: Card, laneIndex?: number): number {
      const owner = card.isOpponent ? game.opponent : game.player;
      const opponent = card.isOpponent ? game.player : game.opponent;
      switch (type) {
        case 'numberKeywords': {
          return (card.keywords ?? []).length;
        }
        case 'cardsPlayedTurn': {
          return owner.cardsPlayed;
        }
        case 'actionsInDiscard': {
          return owner.discard.filter(c => 
            c.type === 'Action'
          ).length;
        }
        case 'numSubtypeDiscard': {
          return owner.discard.filter(c => 
            c.subtypes?.some(sub => card.subtypes?.includes(sub))
          ).length;
        }
        case 'healthGained': {
          return game.healthJustGained; //player healing
        }
        case 'creatureHealAmount':
          return game.lastHealingTaken; //creature healing
        case 'damageJustTaken':
          return game.lastDamageTaken; //damage taken to card
        case 'creatureSummoned': {
          return owner.numSummon ?? 0;
        }
        case 'creaturePlayerDiscardAll': {
          return owner.discard
            .filter(c =>
                c.type === 'Creature').length;
        }
        case 'friendlyDeathsInThisLane': {
          return owner.diedLane[card.laneIndex ?? laneIndex ?? 0];
        }
        case 'cardsDrawnOpponentThisTurn': {
          return opponent.cardsDrawn;
        }
        case 'creatureEnemyThisLaneAll': {
          return opponent.board[card.laneIndex ?? laneIndex ?? 0].length;
        }
        case 'destroyedEnemyRune': {
          return opponent.runes.filter(r => r === false).length;
        }
        case 'creatureFriendlyOtherAll': {
          return (owner.board[0].length + owner.board[1].length - 1);
        }
        case 'creatureFriendlyAll': {
          return (owner.board[0].length + owner.board[1].length);
        }
        case 'creatureFriendlyWardAll': {
          const matchingCount = owner.board[0]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.currentKeywords?.includes('Ward')
          ).length + owner.board[1]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.currentKeywords?.includes('Ward')
          ).length;
          return Math.max(0,matchingCount);
        }
        case 'creatureFriendlyPOtherAll': {
          const matchingCount = owner.board[0]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.attributes.includes('P')
          ).length + owner.board[1]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.attributes.includes('P')
          ).length;
          return Math.max(0,matchingCount - 1);
        }
        case 'creatureFriendlyOtherBreakthrough': {
          const matchingCount = owner.board[0]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.currentKeywords?.includes('Breakthrough')
          ).length + owner.board[1]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.currentKeywords?.includes('Breakthrough')
          ).length;
          return Math.max(0,matchingCount - 1);
        }
        case 'creatureFriendlyDragon': {
          const matchingCount = owner.board[0]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.subtypes?.includes('Dragon')
          ).length + owner.board[1]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.subtypes?.includes('Dragon')
          ).length;
          return Math.max(0,matchingCount);
        }
        case 'creatureFriendlyOrc': {
          const matchingCount = owner.board[0]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.subtypes?.includes('Orc')
          ).length + owner.board[1]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.subtypes?.includes('Orc')
          ).length;
          return Math.max(0,matchingCount);
        }
        case 'creatureFriendlyOtherWolf': {
          const matchingCount = owner.board[0]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.subtypes?.includes('Wolf')
          ).length + owner.board[1]
          .filter(creature => 
            creature.type === 'Creature' &&
            creature.subtypes?.includes('Wolf')
          ).length;
          return Math.max(0,matchingCount-1);
        }
      }
      return 0;
      //friendlyDeathsInThisLane
    }
  
    private clearEndOfTurnEffects(player: PlayerState, game: GameState) {
      //check for windy lane(s)
      if (player === game.opponent) {
        //console.log('check windy');
        const cardsToMove: Card[] = [];
        [0,1].forEach(l => {
          //console.log(`check lane ${l}`);
          if (game.laneTypes[l]==='Windy') {
            //console.log(`lane ${l} is windy`);
            const candidates = [...game.opponent.board[l], ...game.player.board[l]];
            //console.log(`total candidates is ${candidates.length}`);
            if (candidates.length > 0) {
              cardsToMove.push(this.utilityService.random(candidates));
              //console.log(`need to move ${cardsToMove[cardsToMove.length-1]}`);
            }
          }
        });
        cardsToMove.forEach(c => {
          const moveEffect: CardEffect = {
            "trigger": 'EndOfTurn',
            "type": 'move',
            "addKeywords": [],
            "removeKeywords": [],
            "target": 'self'
          };
          console.log(`try to move ${c.name}`);
          this.executeEffect(moveEffect,c,game,c);
        });
      }
      player.board.forEach(lane => {
        lane.forEach(creature => {
          if (creature.shackled && !creature.frozen) {
            creature.shackled = false;
            console.log(`${creature.name} is no longer shackled (end of turn)`);
          }
          if (creature.sick) {
            creature.sick = false;
            console.log(`${creature.name} no longer has summon sickness`);
          }
          if ((creature.tempAttack ?? 0) !== 0) {
            creature.currentAttack = Math.max(0, (creature.currentAttack ?? 0) - (creature.tempAttack ?? 0));
            creature.tempAttack = 0;
          }
          if ((creature.tempHealth ?? 0) !== 0) {
            creature.currentHealth = Math.max(0, (creature.currentHealth ?? 0) - (creature.tempHealth ?? 0));
            creature.maxHealth = Math.max(creature.health ?? 0, (creature.maxHealth ?? 0) - (creature.tempHealth ?? 0));
            creature.tempHealth = 0;
          }
          if (creature.tempKeywords?.length) {
            if (!creature.covered && creature.tempKeywords.includes('Cover') && 
              !creature.currentKeywords?.includes('Guard') &&
              !creature.immunity?.includes('Cover') ) {
              console.log('covering creature at end of turn, assassins bow?');
              creature.covered = true;
              creature.effects?.forEach(effect => {
                if (effect.trigger === 'GainCover') {
                  this.executeEffect(effect, creature, game);
                }
              });
            }
            if (creature.tempKeywords.includes('Shackled')) {
              creature.shackled = true;
            }
            creature.currentKeywords = creature.currentKeywords?.filter(k =>
              !creature.tempKeywords!.includes(k)
            ) || [];
            creature.tempKeywords = [];
          }
          if (creature.endOfTurn) {
            if (creature.endOfTurn === 'destroy') {
              this.destroyCard(game, creature, creature);
            } else if (creature.endOfTurn === 'moveToBottom') {
              const newCardToAdd = this.deckService.getCardById(creature.id);
              const clonedToAdd = this.deckService.cloneCardForGame(newCardToAdd!,creature.isOpponent!);
              player.deck.push(clonedToAdd);
              const lanePos = lane.indexOf(creature);
              if (lanePos !== -1) {
                lane.splice(lanePos, 1);
              }
            }
          }
          // Add other end-of-turn clears here later (e.g. temporary buffs)
        });
      });
      if (game.tempCostAdjustment !== 0) {
        player.hand.forEach(cardInHand => {
          cardInHand.currentCost = (cardInHand.currentCost ?? cardInHand.cost ?? 0) - game.tempCostAdjustment;
        });
        game.tempCostAdjustment = 0;
      }
      if (player.tempCost !== 0) {
        player.hand.forEach(c => {
          c.currentCost! -= player.tempCost;
        });
        player.tempCost = 0;
      }
      const oppPlayer = player === game.player ? game.opponent : game.player;
      oppPlayer.board.forEach(lane => {
        lane.forEach(creature => {
          if (creature.sick) {
            creature.sick = false;
            console.log(`${creature.name} no longer has summon sickness`);
          }
          if ((creature.tempAttack ?? 0) !== 0) {
            creature.currentAttack = Math.max(0, (creature.currentAttack ?? 0) - (creature.tempAttack ?? 0));
            creature.tempAttack = 0;
          }
          if ((creature.tempHealth ?? 0) !== 0) {
            creature.currentHealth = Math.max(0, (creature.currentHealth ?? 0) - (creature.tempHealth ?? 0));
            creature.maxHealth = Math.max(creature.health ?? 0, (creature.maxHealth ?? 0) - (creature.tempHealth ?? 0));
            creature.tempHealth = 0;
          }
          if (creature.tempKeywords?.length) {
            if (!creature.covered && creature.tempKeywords.includes('Cover') && 
              !creature.currentKeywords?.includes('Guard') &&
              !creature.immunity?.includes('Cover') ) {
              console.log('covering creature at end of turn, assassins bow?');
              creature.covered = true;
              creature.effects?.forEach(effect => {
                if (effect.trigger === 'GainCover') {
                  this.executeEffect(effect, creature, game);
                }
              });
            }
            creature.currentKeywords = creature.currentKeywords?.filter(k =>
              !creature.tempKeywords!.includes(k)
            ) || [];
            creature.tempKeywords = [];
          }
          if (creature.endOfTurn) {
            if (creature.endOfTurn === 'destroy') {
              this.destroyCard(game, creature, creature);
            } else if (creature.endOfTurn === 'moveToBottom') {
              const newCardToAdd = this.deckService.getCardById(creature.id);
              const clonedToAdd = this.deckService.cloneCardForGame(newCardToAdd!,creature.isOpponent!);
              oppPlayer.deck.push(clonedToAdd);
              const lanePos = lane.indexOf(creature);
              if (lanePos !== -1) {
                lane.splice(lanePos, 1);
              }
            }
          }
        });
      });
    }
  
    runEffects(trigger: string, player: PlayerState, game: GameState) {
      // Board
      for (let i = 0; i < 2; i++) {
        player.board[i].forEach(card => {
          if (trigger === 'SummonCreature') {
            if (card.instanceId !== game.lastCardSummoned!.instanceId) {
              this.executeEffectsForCard(trigger, card, player, game, -1);
            }
          } else if (trigger === 'FriendlyAttack') {
            if (card.instanceId !== game.stagedAttack!.instanceId) {
              this.executeEffectsForCard(trigger, card, player, game);
            }
          } else if (trigger === 'FriendlySlay') {
            if (card.instanceId !== game.creatureSlayer!.instanceId) {
              this.executeEffectsForCard(trigger, card, player, game);
            }
          } else if (trigger === 'EquipFriendly') {
            if (card.instanceId !== this.findWielderOfItem(game, game.lastCardEquipped!)?.instanceId!) {
              this.executeEffectsForCard(trigger, card, player, game);
            }
          } else {
            this.executeEffectsForCard(trigger, card, player, game);
          }
        });
      }
  
      // Support
      player.support.forEach(card => {
        this.executeEffectsForCard(trigger, card, player, game);
      });
  
      // hand
      player.hand.forEach(card => {
        if (trigger === 'SummonCreature' || trigger === 'EndOfEachTurn') {
          card.effects?.forEach(effect => {
            if (effect.trigger === trigger && 
              effect.type === 'modCost' && effect.target === 'self') {
              this.executeEffect(effect, card, game);
            }
          })
        }
      });
  
      // drawFromDiscard
      player.discard.forEach(card => {
        card.effects?.forEach (effect => {
          if (effect.trigger === trigger && effect.type === 'drawFromDiscard') {
            this.executeEffect(effect, card, game);
          }
        });
      });

      //board summon effect.types after summoncreature
      for (let i = 0; i < 2; i++) {
        player.board[i].forEach(card => {
          if (trigger === 'SummonCreature') {
            if (card.instanceId !== game.lastCardSummoned!.instanceId) {
              this.executeEffectsForCard(trigger, card, player, game, 1);
            }
          } 
        });
      }
    }
  
  executeEffectsForCard(trigger: string, card: Card, player: PlayerState, game: GameState, summonFlag: number = 0) {
    card.effects?.forEach(effect => {
      const triggerMatch = effect.trigger === trigger;
      // Skip if not the right trigger
      if (!triggerMatch) return;
      if (summonFlag === 1 && !effect.type.startsWith('summon')) return;
      if (summonFlag === -1 && effect.type.startsWith('summon')) return;
      const abortAfterEffect = effect.type === 'change';
      // Auto-target effects → execute immediately
      if (this.isAutoTarget(effect.target)) {
        this.executeEffect(effect, card, game, player); // player as context if needed
        if (!abortAfterEffect) console.log(`Executed ${effect.trigger} auto effect on ${card.name}`);
      } else {
          this.executeEffect(effect, card, game);
          if (!abortAfterEffect) console.log(`Executed ${effect.trigger} effect on ${card.name}`);
      }
      //if (abortAfterEffect) return;
    });
  }
  
  resetTurnPlayer(game: GameState, player: PlayerState) {
      // Refill/Increase magicka
      if (game.currentTurn <= 24) {
        player.maxMagicka++;
        if (this.hasDoubleMagickaAura(player)) player.maxMagicka++;
        this.runEffects('MaxMagickaIncreased',player, game);
      }
      player.currentMagicka = Math.min(player.maxMagicka,this.getMagickaLimitAura(game));
      
      // Draw card
      //this.drawCards(player, 1, game);
      // Reset all creatures
      player.board.forEach(lane => {
        lane.forEach(creature => {
          creature.attacks = creature.attacksPerTurn ?? 1;
          if (creature.currentKeywords?.includes('Camouflage')) {
            creature.currentKeywords = creature.currentKeywords.filter(k => k !== 'Camouflage');
          }
          if (!creature.currentKeywords?.includes('Stealth')) {
            creature.covered = false;
          }
          if (creature.currentKeywords?.includes('Regenerate')) {
            if (creature.maxHealth !== creature.currentHealth) {
              game.lastHealingTaken = (creature.maxHealth ?? creature.health ?? 0) - (creature.currentHealth ?? 0);
              creature.currentHealth = creature.maxHealth ?? creature.health ?? 0;
              console.log(`${creature.name} regenerated to full health`);
              this.runEffects('HealCreature',player, game);
            }
          }
        });
      });
      // Reset support activations
      player.support.forEach(card => {
          card.attacks = card.attacksPerTurn ?? 1;
      });

      
  }

  checkReturn(game: GameState, player: PlayerState) {
    let returnCard: Card | null = null;
    for (const card of player.discard) {
      if (card.effects?.some(e => e.type === 'rollForReturn')) {
        if (Math.random() >= 0.9) {
          if (player.board[0].length < 4 || player.board[1].length < 4) {
            returnCard = card;
            break; // optional, if you only want one
          }
        }
      }
    }
    if (returnCard) {
      const discardIndex = player.discard.indexOf(returnCard);
      if (discardIndex !== -1) {
        player.discard.splice(discardIndex,1);
      }
      let returnLane = Math.random() < 0.5 ? 0 : 1;
      if (player.board[returnLane].length >= 4) returnLane = 1 - returnLane;
      //player.board[returnLane].push(returnCard);
      console.log(`${returnCard.name} has returned to lane: ${returnLane}`);
      this.placeOnBoard(game, player, returnLane, returnCard);
    }
  }

  runOpponentTurn(game: GameState) {
      if (game.waitingOnAnimation) return;
      this.clearOpponentLog();
      //this.logOpponent('--- Opponent Turn Start ---');
  
      // Safety
      if (!game.opponent.turn) return;
  
      this.opponentActivateSupports(game, false);
  
      // === PLAY CARDS ===
      let playedSomethingThisLoop = true;
      let attemptsWithoutPlay = 0;
      const maxAttempts = 10; // safety limit to prevent infinite loop
      const attemptedCards: string[] = [];
      
      while (attemptsWithoutPlay < maxAttempts && game.gameRunning) {
        playedSomethingThisLoop = false;
        const hasRingOfMagickaBonus = game.opponent.support.some(s => 
          s.id === 'ring-of-magicka' && (s.attacks ?? 0) > 0 && (s.uses ?? 0) > 0);
        
  
        const playableCards = game.opponent.hand.filter(card =>
          !attemptedCards.includes(card.instanceId!) && 
          (card.currentCost ?? card.cost) <= (game.opponent.currentMagicka + (hasRingOfMagickaBonus ? 1 : 0)) &&
          (!card.playCondition || this.isPlayConditionMet(card.playCondition, game.opponent))
        );
  
        if (playableCards.length === 0) {
          console.log('cpu no playable cards, current magicka is: ', game.opponent.currentMagicka);
          break;
        } 
  
        //const card = this.utilityService.random(playableCards);

        playableCards.sort((a, b) => 
          this.scoreCardForPlay(b, game, game.opponent) - 
          this.scoreCardForPlay(a, game, game.opponent)
        );
        const card = playableCards[0];   // best card
        if (((card.cost - game.opponent.currentMagicka) === 1) && hasRingOfMagickaBonus) {
          console.log(`activate ring of magicka to play ${card.name}`);
          this.opponentActivateSupports(game, true);
        }
        attemptedCards.push(card.instanceId!);
  
        switch (card.type) {
          case 'Creature': {
            const lanes = [0, 1].filter(l => game.opponent.board[l].length < 4 && game.laneTypes[l] !== 'Disabled');
            if (lanes.length === 0) break;
  
            let lane = this.utilityService.random(lanes);
            if (game.laneTypes[lane] === 'Disabled') lane = 1 - lane;
            if (game.useAnimation) {
              game.waitingOnAnimation = true;
              this.queuePendingAction(game, {
                    type: 'creatureAnim',
                    sourceCard: card,
                    validLanes: [lane]
                });
              return;
            } else {
              this.opponentPlayCard(game, card, lane);
              playedSomethingThisLoop = true;
              this.logOpponent(
                `Played creature "${card.name}" to ${game.laneTypes[lane]} lane`
              );
            }
            break;
          }
  
          case 'Item': {
            const targets = this.getOpponentCreatures(game);
            if (targets.length === 0) break;
  
            const target = this.utilityService.random(targets);
            if (game.useAnimation) {
              game.waitingOnAnimation = true;
              this.queuePendingAction(game, {
                    type: 'itemAnim',
                    sourceCard: card,
                    target: target
                });
              return;
            } else {
              this.opponentPlayCard(game, card, undefined, target);
              playedSomethingThisLoop = true;
              this.logOpponent(
                `Played item "${card.name}" on "${target.name}"`
              );
            }
  
            break;
          }
  
          case 'Support': {
            if (game.useAnimation) {
              game.waitingOnAnimation = true;
              this.queuePendingAction(game, {
                    type: 'supportAnim',
                    sourceCard: card
                });
              return;
            } else {
              this.opponentPlayCard(game, card);
              playedSomethingThisLoop = true;
              this.logOpponent(`Played support "${card.name}"`);
            }
            break;
          }
  
          case 'Action': {
            const playEffects = card.effects?.filter(e => e.trigger === 'Play') || [];
            if (playEffects.length === 0) break;
  
            // Try to find a valid target for the first manual-target effect
            let target: Card | PlayerState | undefined = undefined;
            let chosenLane: number | undefined = undefined;
  
            for (const effect of playEffects) {
              if (this.isAutoTarget(effect.target,card.type)) {
                // Auto effect — just play
                target = undefined;
                break;
              }
              if (effect.target?.includes("ane") || effect.target === "lane") {
                chosenLane = this.getBestLaneForOppAction(game, effect);
                if (chosenLane !== undefined) {
                  target = undefined; // lane is chosen separately
                  break;
                }
              } else {
                // Manual target — try to find one
                target = this.getActionTarget(game,card, effect, true);
                if (target) break;
              }
            }            
            const canPlay = target !== undefined || 
                  chosenLane !== undefined || 
                  playEffects.every(e => this.isAutoTarget(e.target,card.type));
  
            if (canPlay) {
              if (game.useAnimation && (target !== undefined || chosenLane !== undefined)) {
                game.waitingOnAnimation = true;
                if (target !== undefined) {
                  this.queuePendingAction(game, {
                      type: 'actionTargetAnim',
                      sourceCard: card,
                      target: target
                  });
                } else if (chosenLane !== undefined) {
                  this.queuePendingAction(game, {
                      type: 'actionLaneAnim',
                      sourceCard: card,
                      validLanes: [chosenLane]
                  });
                }
                return;
              } else {
              // Can play: either found target or all effects are auto
                this.opponentPlayCard(game, card, chosenLane, target);
                playedSomethingThisLoop = true;
                this.logOpponent(
                  target 
                    ? `Played action "${card.name}" on "${(target as any).name || 'face'}"`
                    : `Played action "${card.name}"`
                );
              }
              
            } else {
                console.log(`Could not play action "${card.name}" — no valid targets or lanes`);
            }
            break;
          }
        }
  
        if (playedSomethingThisLoop) {
          attemptsWithoutPlay = 0;
        } else {
          attemptsWithoutPlay++;
        }
      }
  
      this.opponentActivateSupports(game,false);
      if (game.stagedProphecy !== null) { 
          this.queuePendingAction(game, {
              type: 'history'
          });
          return;
      }
      // === ATTACK PHASE ===
      this.opponentAttackPhase2(game);
      if (game.waitingOnAnimation) return;
      if (game.stagedProphecy !== null) { 
          this.queuePendingAction(game, {
              type: 'history'
          });
          return;
      }
  
      if (!game.gameRunning) return;
  
      // === END TURN ===
      this.logOpponent('--- Opponent Turn End ---');
  
      this.endTurn(game);
  
    }

  private getBestLaneForOppAction(game: GameState, effect: CardEffect): number | undefined {
    const opponent = game.opponent;
    const player = game.player;

    // Helper to count creatures in a lane
    const countCreatures = (laneIndex: number, isFriendly: boolean) => {
      const board = isFriendly ? opponent.board[laneIndex] : player.board[laneIndex];
      return board.length;
    };

    let bestLane = -1;
    let bestScore = 0;

    if (effect.target === "lane") {
      // For general lane effects or "This Lane All" → prefer lane with most space
      for (let lane = 0; lane < 2; lane++) {
        if (opponent.board[lane].length >= 4) continue; // full lane
        const space = 4 - opponent.board[lane].length;
        const score = space * 10;
        if (score > bestScore) {
          bestScore = score;
          bestLane = lane;
        }
      }
    }

    if (effect.target === "creatureThisLaneAll") {
      // Prefer lane with highest differential of enemies vs friendly
      for (let lane = 0; lane < 2; lane++) {
        const countFriendly = countCreatures(lane, true);
        const countEnemy = countCreatures(lane, false);
        const count = countEnemy-countFriendly;
        if (count > bestScore && opponent.board[lane].length < 4) {
          bestScore = count;
          bestLane = lane;
        }
      }
    }

    if (effect.target === "creatureFriendlyThisLaneAll") {
      // Prefer lane with most friendly creatures
      for (let lane = 0; lane < 2; lane++) {
        const count = countCreatures(lane, true);
        if (count > bestScore) {
          bestScore = count;
          bestLane = lane;
        }
      }
    }
    if (effect.target === "creatureEnemyThisLaneAll") {
      // Prefer lane with most enemy creatures (to hit them)
      for (let lane = 0; lane < 2; lane++) {
        const count = countCreatures(lane, false);
        if (count > bestScore) {
          bestScore = count;
          bestLane = lane;
        }
      }
    }
    return bestLane !== -1 ? bestLane : undefined;
  }

  private pickBestTarget(targets: (Card | PlayerState)[], game: GameState, source: Card, effect: CardEffect): Card | PlayerState | undefined {
    if (targets.length === 0) return undefined;

    // Score each target
    const scored = targets.map(t => ({
      target: t,
      score: this.scoreTarget(t, game, source, effect)
    }));
    scored.forEach(s => {
      if (!this.isCard(s.target)) {
        console.log(`face: ${s.score}`);
      } else {
        console.log(`${s.target.name}: ${s.score}`);
      }
    });

    // Sort descending
    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.target;
  }

  private scoreTarget(target: Card | PlayerState, game: GameState, source: Card, effect: CardEffect): number {
    let score = 0;

    if (!this.isCard(target)) {
      // Face
      score += 30; // high value if low health
      if (game.player.health <= 5 && source.isOpponent && target === game.player) score += 50;
      if (game.opponent.health <= 5 && !source.isOpponent && target === game.opponent) score += 50;
      return score;
    }

    // Creature target
    const card = target as Card;

    // Prefer low-health enemies for removal/damage
    const tgtLethal = card.currentKeywords?.includes('Lethal');
    const tgtGuard = card.currentKeywords?.includes('Guard');
    const tgtWard = card.currentKeywords?.includes('Ward');
    if (effect.type === 'damage' || effect.type === 'destroy') {
      let damageScore = 0;
      damageScore += (card.currentHealth ?? 0) + (card.currentAttack ?? 0) * 2 + (card.currentCost ?? 0);
      if (effect.type === 'damage' && (effect.amount ?? 0) >= (card.currentHealth ?? 0)) {
        damageScore += 40; //can kill the minion
      }
      if (tgtGuard) damageScore += 20;
      if (tgtLethal) damageScore += 15;
      if ((effect.amount ?? 0) === 1 && tgtWard) damageScore += 30; 
      if (source.isOpponent === card.isOpponent) damageScore *= -1;
      score += damageScore;
    }

    if (effect.type === 'silence' || effect.type === 'unsummon') {
      if (card.attachedItems && card.attachedItems.length > 0) {
        if (source.isOpponent !== card.isOpponent) {
          score += 100; //item removal
        } else {
          score -= 100;
        }
      } else {
        if (effect.type === 'silence' && card.effects && card.effects.length > 0 && card.effects.some(e => e.trigger !== 'Summon')) {
          score += 50 * card.effects.filter(e => e.trigger !== 'Summon').length;
        } else if (effect.type === 'unsummon') {
          if (source.isOpponent !== card.isOpponent) {
            score += 5 * ((card.currentAttack ?? 0) + (card.currentHealth ?? 0));
          } else {
            score -= 5 * ((card.currentAttack ?? 0) + (card.currentHealth ?? 0));
          }
        }
      }
    }

    if (effect.type === 'shackle') {
      score += (card.currentAttack ?? 0) * 3;
    }

    // Prefer friendly targets for buffs
    if (effect.type === 'buffTarget' || effect.type === 'doubleStats' || effect.type === 'doubleAttack' || effect.type === 'doubleHealth') {
      const modAttack = effect.modAttack ?? 0;
      const curAttack = card.currentAttack ?? 0;
      if (modAttack >= 0) {
        score += curAttack * 3; // buff strong creatures
      } else if (modAttack < 0) {
        score -= curAttack;
        if (curAttack <= 0) {
          score -= 100; //already at 0
        } else if (tgtLethal && modAttack >= curAttack) {
          score += 100; //disabling a lethal
        }
      }
    }

    return score;
  }

  private getActivationTarget(
      game: GameState,
      support: Card,
      isOpponent: boolean = true
      ): Card | PlayerState | undefined {
      const activationEffects = support.effects?.filter(e => e.trigger === 'Activation') || [];

      for (const effect of activationEffects) {
          if (this.isAutoTarget(effect.target)) continue;

          // Reuse existing action targeting logic (works great for activations too)
          const target = this.getActionTarget(game, support, effect, isOpponent);
          if (target) {
          console.log(`Opponent selected activation target for ${support.name}`);
          return target;
          }
      }

      // No manual target needed or no valid target found → auto or skip
      return undefined;
  }
  
    private getActionTarget(game: GameState, source: Card, effect: CardEffect, isOpponent: boolean): Card | PlayerState | undefined {
      // Default: try to find any valid target using existing logic
      const effectType = effect.type;
      const sourceLane = 0; // Actions don't have lanes, but we can prioritize
      const allPossible = this.getValidTargets(game,effect.target as TargetType, source);
      const validOnes = allPossible.filter(t => 
        this.isTargetValidForEffect(game, source, effect, t, sourceLane)
      );
      //console.log(`Action target search for effect type "${effectType}": ${validOnes.length} valid targets found`);
      // Filter based on effect type
      let filteredTargets: (Card | PlayerState)[] = [];
      
      if (effectType === 'buffTarget') {
          if ((effect.modAttack ?? 0) < 0 || (effect.modHealth ?? 0) < 0 ||
          (effect.tempAttack ?? 0) < 0 || (effect.removeKeywords ?? []).length > 0) {
          // Only friendly targets (opponent's own creatures)
          filteredTargets = validOnes.filter(target => {
            return this.isCard(target) && 
                  target.isOpponent !== isOpponent && 
                  target.type === 'Creature';
          });
        } else {
          // Only friendly targets (opponent's own creatures)
          filteredTargets = validOnes.filter(target => {
            return this.isCard(target) && 
                  (target.instanceId !== source.instanceId || game.classicTargeting) &&
                  target.isOpponent === isOpponent && 
                  target.type === 'Creature';
          });
        }
      } 
      else if (effectType === 'destroy' || effectType === 'damage'
          || effectType === 'silence' || effectType === 'unsummon'
          || effectType === 'shackle'
      ) {
        // Only enemy targets (player's creatures or face)
        filteredTargets = validOnes.filter(target => {
          // Include enemy's creatures
          if (this.isCard(target) && target.isOpponent !== isOpponent) {
            return target.type === 'Creature';
          }
          // Or the enemy face
          return (target === game.player && source.isOpponent) || 
            (target === game.opponent && !source.isOpponent);
        });
      } 
      else {
        // Fallback: use normal validation
        filteredTargets = validOnes.filter(target =>
          this.isTargetValidForEffect(game, source, effect, target, 0)
        );
      }
      return filteredTargets.length > 0 ? 
        this.pickBestTarget(filteredTargets, game, source, effect) : 
        undefined;
    }

    private scoreCardForPlay(card: Card, game: GameState, player: PlayerState): number {
      let score = 0;

      const cost = card.currentCost ?? card.cost ?? 0;
      const phase = this.getGamePhase(game);   // early / mid / late

      // Base value by cost (higher = more powerful usually)
      score += cost * 4;

      // Mana efficiency bonus
      if (cost <= player.currentMagicka - 2) score += 8;     // very efficient
      if (cost === player.currentMagicka) score += 15;       // using all mana is good

      // === CREATURE SCORING ===
      if (card.type === 'Creature') {
        const atk = card.currentAttack ?? card.attack ?? 0;
        const hp  = card.currentHealth ?? card.health ?? 0;

        score += atk * 5.5;
        score += hp * 3.5;

        // Keywords
        if (card.currentKeywords?.includes('Charge')) score += 35;
        if (card.currentKeywords?.includes('Guard')) score += 22;
        if (card.currentKeywords?.includes('Breakthrough')) score += 18;
        if (card.currentKeywords?.includes('Lethal')) score += 25;
        if (card.currentKeywords?.includes('Ward')) score += 12;

        // Synergy with board
        const bestLane = this.getBestLaneForCreature(game, player, card);
        if (bestLane !== -1) score += 15;

        // Early game bonus for cheap creatures
        if (phase === 'early' && cost <= 3) score += 20;
      }

      // === ACTION / ITEM SCORING ===
      if (card.type === 'Action' || card.type === 'Item') {
        const effects = card.effects || [];

        // Removal / damage
        if (effects.some(e => e.type === 'damage' && (e.amount ?? 0) >= 4)) score += 28;
        if (effects.some(e => e.type === 'destroy')) score += 32;

        // Draw / advantage
        if (effects.some(e => e.type === 'drawCards')) score += 25;

        // Buffs
        if (effects.some(e => e.type === 'buffTarget' && (e.modAttack ?? 0) > 0)) score += 18;

        // Early game removal is very strong
        if (phase === 'early' && effects.some(e => e.type === 'damage' || e.type === 'destroy')) {
          score += 15;
        }
      }

      // Penalty for playing very expensive cards too early
      if (phase === 'early' && cost >= 6) score -= 25;

      return Math.max(0, score);
    }

    private pickBestAttackTarget(attacker: Card, targets: (Card | PlayerState)[], game: GameState): Card | PlayerState {
      if (targets.length === 0) return game.player; // fallback to face

      const scored = targets.map(target => ({
        target,
        score: this.scoreTargetForAttack(attacker, target, game)
      }));
      scored.forEach(s => {
        if (!this.isCard(s.target)) {
          console.log(`face: ${s.score}`);
        } else {
          console.log(`${s.target.name}: ${s.score}`);
        }
      });

      // Sort by score (highest first)
      scored.sort((a, b) => b.score - a.score);

      return scored[0].target;
    }

    private scoreTargetForAttack(attacker: Card, target: Card | PlayerState, game: GameState): number {
      let score = 0;

      // === FACE ATTACK ===
      if (!this.isCard(target)) {
        const oppHealth = game.player.health;
        score = 25 + Math.max(0, (30 - oppHealth) * 2.5); // very valuable when low health
        return score;
      }

      // === CREATURE TARGET ===
      const def = target as Card;
      const atkDamage = attacker.currentAttack ?? 0;
      const atkHealth = attacker.currentHealth ?? 0;
      const defDamage = def.currentAttack ?? 0;
      const defHealth = def.currentHealth ?? 0;
      const atkWard = attacker.currentKeywords?.includes('Ward');
      const atkLethal = attacker.currentKeywords?.includes('Lethal');
      const defWard = def.currentKeywords?.includes('Ward');
      const defGuard = def.currentKeywords?.includes('Guard');
      const defLethal = def.currentKeywords?.includes('Lethal');
      const defBreak = def.currentKeywords?.includes('Breakthrough');
      const defRegen = def.currentKeywords?.includes('Regenerate');
      const defDrain = def.currentKeywords?.includes('Drain');
      const canKill = (atkDamage >= defHealth || atkLethal) && !defWard;
      const canSurvive = atkWard || (atkHealth >= defDamage && !defLethal);

      // Base kill value
      if (canKill) score += 45;
      if (canSurvive) score += 45;

      // Trade efficiency (positive = good trade)
      //if (canKill) {
        score += (defDamage*2 + defHealth - atkDamage*2 - atkHealth) * 10;
      //}

      // Valuable keywords to remove
      if (defGuard) score += 28;
      if (defLethal) score += 32;
      if (defBreak) score += 22;
      if (defWard) score += 18;
      if (defDrain) score += 25;

      // Regenerate penalty (unless lethal)
      if (defRegen && !canKill) {
        score -= 40;
      }

      // Prefer small attackers on Ward
      if (defWard && atkDamage <= 3) {
        score += 15;
      }

      // Avoid terrible trades
      if (!canKill && defHealth > atkDamage * 1.8) {
        score -= 25;
      }

      return Math.max(0, score);
    }

    private getGamePhase(game: GameState): 'early' | 'mid' | 'late' {
      const turn = game.currentTurn ?? 0;
      if (turn <= 10) return 'early';
      if (turn <= 20) return 'mid';
      return 'late';
    }

    private getBestLaneForCreature(game: GameState, player: PlayerState, card: Card): number {
      const lanes = [0, 1].filter(l => 
        player.board[l].length < 4 && 
        game.laneTypes[l] !== 'Disabled'
      );

      if (lanes.length === 0) return -1;

      // Prefer empty lane
      const emptyLanes = lanes.filter(l => player.board[l].length === 0);
      if (emptyLanes.length > 0) return emptyLanes[0];

      // Otherwise pick the one with fewer creatures
      return lanes.reduce((best, l) => 
        player.board[l].length < player.board[best].length ? l : best
      );
    }
  
    findWielderOfItem(game: GameState, item: Card): Card | null {
      // Check both players' boards
      for (const player of [game.player, game.opponent]) {
        for (const lane of player.board) {
          for (const creature of lane) {
            if (creature.attachedItems?.some(attached => attached.instanceId === item.instanceId)) {
              return creature;
            }
          }
        }
      }
      return null;
    }
  
    private currentDeathTotalThisTurn(game: GameState): number {
      return game.player.diedLane[0] + game.player.diedLane[1] +
        game.opponent.diedLane[0] + game.opponent.diedLane[1];
  }

  private isOpponentTurn(game: GameState): boolean {
      if (game.cpuPlaying || !game.gameRunning) {
        return false;
      } else if (game.player.turn) {
        if (game.stagedProphecy) {
          return true;
        } else {
          return false;
        }
      } else {
        if (game.stagedProphecy) {
          return false;
        } else {
          return true;
        }
      }
  }


    private drawFilteredCards(player: PlayerState, amount: number, game: GameState, cost?: number, subtypes?: string[]) {
      if (amount <= 0) return;
      //const cardsToDraw = Math.min(10-player.hand.length,amount);
      const cardsToDraw = amount;
  
      let deck = player.deck;
  
      // Apply filters if provided
      if (cost !== undefined || subtypes?.length) {
        deck = deck.filter(card => {
          //console.log(`cost checked is ${cost}`);
          const costMatch = cost === undefined || (card.currentCost ?? card.cost ?? 0) === cost;
          let typeOrSubtypeMatch = true;
  
          if (subtypes?.length) {
            // Check if subtypes are actually types
            const isTypeFilter = subtypes.every(s => ['Action', 'Item', 'Creature', 'Support'].includes(s));
  
            if (isTypeFilter) {
              // Filter by type
              typeOrSubtypeMatch = subtypes.includes(card.type);
            } else {
              // Filter by subtypes
              typeOrSubtypeMatch = card.subtypes?.some(sub => subtypes.includes(sub)) ?? false;
            }
          }
  
          return costMatch && typeOrSubtypeMatch;
        });
      }
  
      if (deck.length === 0) {
        console.log(`No cards match filter (cost ≤ ${cost ?? 'any'}, subtypes: ${subtypes?.join(', ') || 'any'})`);
        return;
      }
  
      // Shuffle filtered deck to randomize draw order
      deck = this.utilityService.shuffle([...deck]);
  
      // Draw up to 'amount' cards
      const drawn = deck.slice(0, cardsToDraw);
  
      drawn.forEach(card => {
          game.lastCardDrawn = card;
          if (player.hand.length >= 10) {
              console.log(`Burned: ${card.name} because hand is full`);
              //this.showBurnHint(card, player === game.opponent);
              this.queuePendingAction(game, {
                  type: 'burn',
                  sourceCard: card,
                  opponentTarget: player === game.opponent
              });
          } else {
              player.deck = player.deck.filter(c => c.instanceId !== card.instanceId);
              player.hand.push(card);
              console.log(`Drew filtered card: ${card.name}`);
              this.runEffects('DrawCard',player,game);
              this.executeEffectsForCard('AddToHand', card, player, game);
          }
      });
  
      // Optional: shuffle deck after draw
      player.deck = this.utilityService.shuffle(player.deck);
      this.reapplyHandAuras(player);
      this.updateStaticBuffs(game, player);
  }

  private transformShoutCopies(cards: Card[], originalId: string, upgradedId: string) {
    //console.log('trying to transform copies');
    cards.forEach(card => {
      if (card.id === originalId) {
        // Preserve cost modifications & other runtime state
        const preservedCost = card.currentCost ?? card.cost;

        // Replace with upgraded version
        const upgradedTemplate = this.deckService.getCardById(upgradedId);
        if (!upgradedTemplate) {
          console.warn(`Upgraded shout not found: ${upgradedId}`);
          return;
        }

        Object.assign(card, this.deckService.cloneCardForGame(upgradedTemplate, card.isOpponent!));
        
        // Restore preserved runtime values
        card.currentCost = preservedCost;
      } 
    });
  }

  placeOnBoard(game: GameState, player: PlayerState, lane: number, card: Card) {
    game.lastCardSummoned2 = game.lastCardSummoned;
    game.lastCardSummoned = card;
    
    player.board[lane].push(card);
    if (game.laneTypes[lane] === 'Plunder') {
      const itemEffect: CardEffect = {
        "trigger": "Summon",
        "type": "equipRandom",
        "addKeywords": [],
        "removeKeywords": [],
        "target": "self"
      }
      this.executeEffect(itemEffect,card,game,card);
    }
    if (player.numSummon == 0) {
      this.runEffects('SummonFirst',player, game);
    }
    player.numSummon++;
    
    if (game.laneTypes[card.laneIndex!] === 'Shadow' && 
        !card.keywords?.includes('Guard') &&
        !card.immunity?.includes('Cover') ) {
      card.covered = true;
      card.effects?.forEach(effect => {
        if (effect.trigger === 'GainCover') {
          this.executeEffect(effect, card, game);
        }
      });
    }

    this.queuePendingAction(game, {
        type: 'audio',
        sourceCard: card,
        prompt: 'enter'
    });
    this.runEffects('SummonCreature', player, game);
    this.runEffects('SummonCreatureEnemy', 
      player === game.player ? game.opponent : game.player, game);

    console.log(`Summoned ${card.name} to lane ${lane}`);

  }

  executeEffect(effect: CardEffect, sourceCard: Card, game: GameState, chosenTarget?: Card | PlayerState, chosenLane?: number) {
    const outputLogs = game.simulating ? false : true;
    if (effect.type === 'choice' || effect.type === 'revealAndTransform' || effect.type === 'choiceRandom' || effect.type === 'scry') {
      if (!effect.choices || effect.choices.length === 0) {
        if (outputLogs) console.warn('Choice effect has no options');
        return;
      }
      if (effect.type === 'revealAndTransform') {
        if (outputLogs) console.log('Processing revealAndTransform as choice effect with options: ', effect.choices);
        
        const randomCard = this.deckService.getRandomCreatureByCost(20,"max");
        game.creatureRevealed = randomCard!;
        if (sourceCard.isOpponent && game.cpuPlaying) {
          if (outputLogs) console.log('cpu doesnt need reveal');
        } else {
          this.queuePendingAction(game, {
            type: 'reveal',
            sourceCard,
            effect,
            revealCards: [randomCard!],
            prompt: `Choose creature to transform into ${randomCard!.name}`
          });
        }
      }
      const currentChoiceEffect = effect;
      const currentChoiceSource = sourceCard;
      const currentChoiceOptions = effect.choices;
      let selectedChoiceIndex = null;
      if (sourceCard.isOpponent && game.cpuPlaying) {
        if (effect.type === 'scry') return;
        selectedChoiceIndex = Math.floor(Math.random() * effect.choices.length);
        
        const chosen = currentChoiceOptions[selectedChoiceIndex];
        const nestedEffect = chosen.effect;

        // Check if nested effect needs manual target
        if (!this.isAutoTarget(nestedEffect.target)) {
          const aiTarget = this.getSummonTarget(game, nestedEffect, sourceCard, sourceCard.isOpponent);
          if (aiTarget) {
            this.executeEffect(nestedEffect, sourceCard, game, aiTarget);
          } else {
            if (outputLogs) console.log(`No valid target for ${sourceCard.name}`);
          }
        } else {
          // Auto-apply immediately
          this.executeEffect(nestedEffect, currentChoiceSource, game);
        }
        return;
      }
      if (effect.type === 'scry') game.waitingOnScry = true;
      this.queuePendingAction(game, {
        type: 'choice',
        sourceCard,
        effect,
        options: effect.choices,
        prompt: effect.type === 'choiceRandom' ? 'random' : 'Choose an effect'
      });
      //this.selectedChoiceIndex = null;
      //this.showChoiceModal = true;
      return;
    }
    
    if (effect.condition && !this.isConditionMet(game, effect, effect.condition, sourceCard, chosenTarget)) {
      if (outputLogs) console.log(`Effect skipped: condition not met for ${sourceCard.name}`);
      return; // Early exit if condition fails
    }

    const owner = sourceCard.isOpponent ? game.opponent : game.player;
    const enemy = sourceCard.isOpponent ? game.player : game.opponent;
    
    let targetLane: number | undefined;  
    if (chosenLane !== undefined) {
      if (outputLogs) console.log('set lane to chosen lane: ', chosenLane);
      targetLane = chosenLane;
    }
    //lane targeting for summon effect types
    if (effect.type.startsWith('summon')) {  
      if (effect.trigger === 'SummonCreature' && effect.cardId && 
        effect.cardId === game.lastCardSummoned!.id
      ) {
        if (outputLogs) console.log('avoiding duplicating effect');
        return;          
      }
      if (effect.target === 'randomLane') {
        targetLane = (Math.random() < 0.5 ? 0 : 1);
        if (owner.board[targetLane].length >= 4) {
          //try other lane
          targetLane = 1 - targetLane;
        }
      } else if (effect.target === 'otherLane') {
        if (sourceCard.laneIndex === undefined) {
          if (outputLogs) console.warn('Cannot summon to other lane — source has no laneIndex');
          return;
        }
        targetLane = 1 - sourceCard.laneIndex; // 0 → 1, 1 → 0
        if (effect.type === 'summonCopy' || effect.trigger === 'SummonCreature') {
            if (!game.lastCardSummoned) {
                if (outputLogs) console.warn('Missing card to copy');
                return;
            }
            targetLane = 1 - game.lastCardSummoned!.laneIndex!;
        }
      } else if (effect.target === 'leftLane') {
        targetLane = 0;
      } else if (effect.target === 'rightLane') {
        targetLane = 1;
      } else if (effect.target === 'thisLane') {
        targetLane = sourceCard.laneIndex;
      } else if (typeof effect.target === 'number') {
        targetLane = effect.target; // rare case — explicit lane number
      } else if (effect.target === 'lane') {
        if (sourceCard.laneIndex !== undefined) {
          if (outputLogs) console.log('source card lane index is defined. using: ', sourceCard.laneIndex);
          targetLane = sourceCard.laneIndex;
        }
        if (targetLane === undefined) {
          if (outputLogs) console.log('using random lane a');
          targetLane = sourceCard.laneIndex ?? (Math.random() < 0.5 ? 0 : 1);
        }
      } else {
        // Default: try to use source lane, or random available
        if (outputLogs) console.log('using random lane b');
        targetLane = sourceCard.laneIndex ?? (Math.random() < 0.5 ? 0 : 1);
      }

      if (targetLane === undefined || targetLane < 0 || targetLane > 1) {
        if (outputLogs) console.warn('Invalid summon target lane');
        return;
      }

      if (targetLane !== undefined && game.laneTypes[targetLane] === 'Disabled') {
        if (effect.target === 'rightLane') {
          if (outputLogs) console.warn('Disabled summon target lane');
          return;
        } else {
          targetLane = 1 - targetLane;
        }
      }

      // Check if lane is full
      if (owner.board[targetLane].length >= 4 && effect.type !== 'summonOpponent') {
        if (outputLogs) console.log(`Summon skipped: lane ${targetLane} is full`);
        return;
      }
    }

    if (effect.type.startsWith('summon')) {  // covers summon, summonDiscard, summonSlain
      let cardToSummon: Card | undefined;
      let summonCost = 0;
      // 1. Determine source card
      if (effect.type === 'summon' || effect.type === 'summonOpponent' || effect.type === 'summonBuffStats') {
        if (effect.cardId) {
          if (effect.cardId === 'targetedCreature' && game.lastCreatureTargeted?.id) {
            cardToSummon = this.deckService.getCardById(game.lastCreatureTargeted.id);
          } else {
            cardToSummon = this.deckService.getCardById(effect.cardId);
          }
        } else if (effect.subtypes?.length) {
          cardToSummon = this.deckService.getRandomCardBySubtypes(effect.subtypes);
        } else if (effect.names?.length) {
          cardToSummon = this.deckService.getRandomCardByNames(effect.names);
        }
      } else if (effect.type === 'summonCopy') {
        if (game.lastCardSummoned!.name === game.lastCardSummoned2?.name) {
          if (outputLogs) console.log(`${game.lastCardSummoned!.name} seems to have already been copied`);
          return;
        }
        cardToSummon = game.lastCardSummoned!;
      } else if (effect.type === 'summonDeck' || effect.type === 'summonDeckLastCost' ||
        effect.type === 'summonDeckCost'
      ) {
        let costFilter: number = -1;
        if (effect.type === 'summonDeckLastCost') {
          costFilter = game.lastCardPlayed!.cost;
        } else if (effect.type === 'summonDeckCost') {
          costFilter = effect.cost! + (sourceCard.scaleDamage ?? 0);
          if ((effect.increment ?? 0) > 0) {
            sourceCard.scaleDamage = (sourceCard.scaleDamage ?? 0) + effect.increment!;
          }
        }
        let deckCreatures = owner.deck.filter(c => c.type === 'Creature');
        if (costFilter >= 0) {
          deckCreatures = deckCreatures.filter(c => c.cost === costFilter);
        }
        if (deckCreatures.length === 0) {
          if (outputLogs) console.log('No creatures in deck to summon');
          cardToSummon = this.deckService.getCardById('sweet-roll');
        } else {
          cardToSummon = this.utilityService.random(deckCreatures);
        }
      } else if (effect.type === 'summonRandomCost') {
        if (effect.cost !== undefined && effect.cost !== null) {
          summonCost = effect.cost;
          if (effect.increment) summonCost = summonCost + effect.increment;
          if (outputLogs) console.log('find creature with cost: ', summonCost);
          cardToSummon = this.deckService.getRandomCreatureByCost(summonCost,'equal');
        } else if (!chosenTarget || !this.isCard(chosenTarget)) {
          console.warn('no target for summonRandomCost effect');
          return;
        } else {
          targetLane = chosenTarget.laneIndex;
          summonCost = chosenTarget.cost;
          if (effect.increment) summonCost = summonCost + effect.increment;
          if (outputLogs) console.log('find creature with cost: ', summonCost);
          cardToSummon = this.deckService.getRandomCreatureByCost(summonCost,'equal');
        }
      } else if (effect.type === 'summonRandomMax') {
        summonCost = owner.maxMagicka;
        cardToSummon = this.deckService.getRandomCreatureByCost(summonCost,'max');
      } else if (effect.type === 'summonDiscard' || effect.type === 'summonOppDiscard' || effect.type === 'summonHighTemp') {
        // 1. Determine which player's discard pile to use
        const discardOwner = effect.type !== 'summonOppDiscard' ? 
          (sourceCard.isOpponent ? game.opponent : game.player) : (sourceCard.isOpponent ? game.player : game.opponent);
        const discardPile = discardOwner.discard || [];

        if (discardPile.length === 0) {
          if (outputLogs) console.log(`No cards in discard pile for ${sourceCard.name} summonDiscard`);
          return;
        }

        // 2. Optional: filter by subtypes or other criteria if specified
        let candidates = [...discardPile];
        candidates = candidates.filter(c => 
            c.type === 'Creature');

        if (effect.subtypes && effect.subtypes.length > 0) {
          candidates = candidates.filter(c => 
            c.subtypes?.some(sub => effect.subtypes!.includes(sub))
          );
        }

        if (candidates.length === 0) {
          if (outputLogs) console.log(`No matching cards in discard for summonDiscard (${effect.subtypes?.join(', ') || 'any'})`);
          return;
        }

        // 3. Pick one random card from candidates
        if (effect.type === 'summonHighTemp') {

          // Find highest cost
          const maxCost = Math.max(...candidates.map(c => c.cost ?? 0));

          // Filter to highest-cost cards
          const highest = candidates.filter(c => (c.cost ?? 0) === maxCost);

          // Pick random among them
          cardToSummon = this.utilityService.random(highest);

        } else {

          // Normal random summon
          cardToSummon = this.utilityService.random(candidates);
        }
      } else if (effect.type === 'summonSlain') {
        if (game.creatureSlain?.id) {
          cardToSummon = this.deckService.getCardById(game.creatureSlain.id);
        }
      }

      if (!cardToSummon) {
        if (outputLogs) console.warn(`Summon failed: no card found for ${effect.type}`);
        return;
      }

      const numToSummon = effect.amount ?? 1;

      for (let i = 0; i < numToSummon; i++) {
        const altPlayer = effect.type === 'summonOpponent';
        // Skip if lane is full
        if (altPlayer) {
          if (enemy.board[targetLane!].length >= 4) {
            if (outputLogs) console.log(`Lane full, skipping summon of ${cardToSummon.name}`);
            continue;
          }
        } else {
          if (owner.board[targetLane!].length >= 4) {
            if (outputLogs) console.log(`Lane full, skipping summon of ${cardToSummon.name}`);
            continue;
          }
        }

        // Clone & prepare
        const summonedCopy = this.deckService.cloneCardForGame(cardToSummon, 
          altPlayer ? !sourceCard.isOpponent! : sourceCard.isOpponent!);
        
        const creatureCopy: Card = {
          ...summonedCopy,
          laneIndex: targetLane,
          attachedItems: [],
          sick: summonedCopy.keywords?.includes('Charge') ? false : true,
          attacks: 1,
          covered: game.laneTypes[targetLane!] === 'Shadow' && !summonedCopy.keywords?.includes('Guard') &&
            !summonedCopy.immunity?.includes('Cover'),
        };

        if (creatureCopy.id === 'ancient-giant' && summonCost > 0) {
          if (outputLogs) console.log('using ancient giant because no match at requested cost: ', summonCost);
          creatureCopy.currentCost = summonCost;
          creatureCopy.currentAttack = summonCost;
          creatureCopy.currentHealth = summonCost;
          creatureCopy.maxHealth = summonCost;
        }

        // Special handling per summon type
        if (effect.type === 'summonDiscard' || effect.type === 'summonOppDiscard' || effect.type === 'summonHighTemp') {
          // Remove from discard
          const discardOwner = effect.type !== 'summonOppDiscard' ? 
            (sourceCard.isOpponent ? game.opponent : game.player) : (sourceCard.isOpponent ? game.player : game.opponent);
          const index = discardOwner.discard.findIndex(c => c.instanceId === cardToSummon.instanceId);
          if (index !== -1) {
            discardOwner.discard.splice(index, 1);
          }
          if (effect.type === 'summonHighTemp') {
            this.addUniqueKeywords(creatureCopy, game, [ 'Charge']);
            creatureCopy.endOfTurn = 'moveToBottom';
            if (outputLogs) console.log(`flagging ${creatureCopy.name} to move to bottom of deck at end of turn`);
          }
        } else if (effect.type === 'summonSlain') {
          // Optional: clear slain reference if needed
          game.creatureSlain = null;
        } else if (effect.type === 'summonDeck' || effect.type === 'summonDeckCost' ||
          effect.type === 'summonDeckLastCost'
        ) {
          const index = owner.deck.findIndex(c => c.instanceId === cardToSummon.instanceId);
          if (index !== -1) {
            owner.deck.splice(index,1);
          }
        } else if (effect.type === 'summonBuffStats') {
          const timesPlayed = owner.playCounts[sourceCard.id] || 0;
          if (timesPlayed > 0) {
            creatureCopy.currentAttack! += timesPlayed;
            creatureCopy.currentHealth! += timesPlayed;
            creatureCopy.maxHealth! += timesPlayed;
          }
        }

        // Place on board
        this.placeOnBoard(game, altPlayer ? enemy : owner, targetLane!, creatureCopy);
        
        // Trigger its own Summon effects
        if (creatureCopy.id !== sourceCard.id) {
          //this.executeEffectsForCard('Summon',creatureCopy, owner, game);
          creatureCopy.effects?.forEach(e => {
            if (e.trigger !== 'Summon') return;

            if (this.isAutoTarget(e.target)) {
              this.executeEffect(e, creatureCopy, game);
            } else {
              const aiTarget = this.getSummonTarget(game, e, creatureCopy, creatureCopy.isOpponent!);
              if (aiTarget) {
                this.executeEffect(e, creatureCopy, game, aiTarget);
              } else {
                if (outputLogs) console.log(`No valid summon target for ${creatureCopy.name}`);
              }
            }
          });
        }

        // Apply auras & check death
        this.applyCardAuras(game, creatureCopy, altPlayer ? enemy: owner);
        const deathsBefore = this.currentDeathTotalThisTurn(game);
        this.checkCreatureDeath(game);
        const deathsAfter = this.currentDeathTotalThisTurn(game);
        if (deathsAfter !== deathsBefore) {
          this.checkCreatureDeath(game);
        }
      }

      // Common history log
      this.logHistory(game,{
        player: owner === game.player ? 'You' : 'Opponent',
        actionType: 'summon-effect',
        description: `${owner === game.player ? 'You' : 'Opponent'}: ${sourceCard.name} summoned ${cardToSummon.name} (${effect.type})`,
        details: [`Lane: ${game.laneTypes[targetLane!]}`]
      });

      // Cleanup staging if needed
      if (game.stagedSummon === sourceCard) {
        this.clearSummonTargeting(game);
      }

      return;  // Exit early — no need to process other effect types
    }
      
    const isMassEffect = this.isMassSummonEffect(effect.target);
    let targets: (Card | PlayerState)[] = [];
    if (effect.type === 'buffSelf') {
      // Self-buff always targets source
      if (sourceCard.type === 'Item') {
        const wielder = this.findWielderOfItem(game, sourceCard);
        if (wielder) {
          targets = [wielder];
        } else {
          console.warn(`BuffSelf on item ${sourceCard.name} — no wielder found`);
          return;
        }
      } else if (sourceCard.type === 'Creature') {
        targets = [sourceCard];
      } else {
        console.warn('invalid target for buffself');
        return;
      }
    } else if (effect.target === 'self') {
      targets = [sourceCard];
    } else if (effect.target === 'drawnCard') {
      targets = [game.lastCardDrawn!];
    } else if (effect.target === 'deck') {
      targets = [...owner.deck];
    } else if (effect.target === 'thief') {
      targets = [game.thief!];
    } else if (effect.target === 'wielder') {
      targets = [this.findWielderOfItem(game, sourceCard)!];
    } else if (effect.target === 'moved') {
      targets = [game.creatureMoved!];
    } else if (effect.target === 'slain') {
      targets = [game.creatureSlain!];
    } else if (effect.target === 'slayer') {
      targets = [game.creatureSlayer!];
    } else if (effect.target === 'creatureShackled') {
      targets = [game.creatureShackled!];
    } else if (effect.target === 'lastCardUsed') {
      targets = [game.lastCardDealingDamage!];
    } else if (effect.target === 'creatureDamaged') {
      targets = [game.lastCardReceivingDamage!];
    } else if (effect.target === 'players') {
        targets = [game.player, game.opponent];
    } else if (effect.target === 'summon') {
      if (!game.lastCardSummoned) {
        if (outputLogs) console.warn('No last summoned card available');
        return;
      }
      // Apply targetCondition to filter the summon target
      if (effect.targetCondition && 
        !this.deckService.isTargetConditionMet(game.lastCardSummoned, effect.targetCondition, sourceCard)) {
        if (outputLogs) console.log(`Summon effect skipped: target condition not met for ${sourceCard.name}`);
        return;
      }
      targets = [game.lastCardSummoned];
    } else if (effect.type === 'maxMagicka' || effect.type === 'drawCards') {
      targets = [sourceCard.isOpponent ? game.opponent : game.player];
    } else if (isMassEffect) {
      // Get ALL matching targets automatically
      targets = this.getMassSummonTargets(game,effect, sourceCard, targetLane);      
    } else if (this.isAutoTarget(effect.target)) {
      let finalTarget = this.getAutoTarget(game,effect.target!, sourceCard, effect);
      if (finalTarget) targets = [finalTarget];
    } else {
      // Single target (auto or chosen)
      let finalTarget: Card | PlayerState | null = chosenTarget ?? null;
      if (finalTarget === null) {
        const aiTarget = this.getSummonTarget(game, effect, sourceCard, sourceCard.isOpponent!);
        if (aiTarget) {
          finalTarget = aiTarget;
          this.executeEffect(effect, sourceCard, game, aiTarget);
          if (outputLogs) console.log(`Automatically chose target: ${(aiTarget as any).name || 'face'}`);
        } else {
          if (outputLogs) console.log(`No valid target for: ${sourceCard.name}`);
        }
      }
      if (finalTarget) targets = [finalTarget];
    }

    if (effect.targetCondition) {
      targets.filter(t => {
        if (!this.isCard(t)) return true; // players pass
        return this.deckService.isTargetConditionMet(t as Card, effect.targetCondition, sourceCard);
    });
    }

    if (targets.length > 0) {
      if (effect.trigger === 'PlayCard' || effect.trigger === 'EndOfTurn') {
        this.queuePendingAction(game, {
          type: 'audio',
          sourceCard: sourceCard,
          prompt: 'trigger'
        });
      }
    }

    if (targets.length > 0) {
      const ownerName = owner === game.player ? 'You' : 'Opponent';
      const effectDesc = `${ownerName}: ${sourceCard.name} → ${effect.trigger} (${effect.type})`;
      let targetDetails: string[] = [];
      if (targets && targets.length > 0) {
        targetDetails = targets.map(t => {
          if (this.isCard(t)) {
            return t.name;
          } else {
            return t === game.player ? 'Player' : 'Opponent';
          }
        });
      } else if (chosenTarget) {
        targetDetails = [this.isCard(chosenTarget) ? chosenTarget.name : 
                        (chosenTarget === game.player ? 'Player' : 'Opponent')];
      } else {
        targetDetails = ['(no specific target)'];
      }
      this.logHistory(game,{
        player: owner === game.player ? 'You' : 'Opponent',
        actionType: 'effect',
        description: effectDesc,
        details: [`Targets: ${targetDetails.join(', ')}`]
      });
    }

    targets.forEach(target => {
      switch (effect.type) {
        case 'revealTopDeck':
          if (sourceCard.isOpponent && game.cpuPlaying) {
            if (outputLogs) console.log('cpu doesnt need reveal');
            break;
          }
          if (this.isCard(target)) {
            if (outputLogs) console.warn('revealTopDeck needs player');
            break;
          }
          const deck = target.deck;
          if (deck.length === 0) {
            if (outputLogs) console.log('Deck empty — nothing to reveal');
            break;
          }

          

          const isEnemy = effect.target === 'opponent';
          // Show top card(s)
          const topCards = deck.slice(0, effect.amount ?? 1);
          this.queuePendingAction(game, {
            type: 'reveal',
            sourceCard,
            effect,
            revealCards: topCards,
            prompt: `Top of ${isEnemy ? "Opponent's" : "Your"} Deck`
          });

          if (outputLogs) console.log(`Revealed top ${topCards.length} card(s) from ${isEnemy ? 'opponent' : 'player'} deck`);
          break;

        case 'revealAndGuess': {
          if (this.isCard(target)) {
            if (outputLogs) console.warn('revealAndGuess needs PlayerState target');
            break;
          }

          const player = target as PlayerState; // the guessing player
          const enemy = player === game.player ? game.opponent : game.player;

          const handIds = new Set(target.hand.map(c => c.id)); // IDs already in enemy's hand

          if (target.deck.length < (effect.amount ?? 3) - 1) {
            if (outputLogs) console.log(`Not enough cards in enemy deck for revealAndGuess`);
            break;
          }

          // 1. Pick 1 real card from enemy's hand (or fallback if hand empty)
          let realHandCard: Card | undefined;
          if (target.hand.length > 0) {
            realHandCard = this.utilityService.random(target.hand);
          } else {
            if (outputLogs) console.log('Enemy hand empty — using deck card as fallback');
          }

          // 2. Pick remaining cards from enemy deck, excluding hand IDs
          let deckCandidates = target.deck.filter(c => !handIds.has(c.id));
          deckCandidates = this.utilityService.shuffle(deckCandidates);

          const numDeckCards = (effect.amount ?? 3) - (realHandCard ? 1 : 0);
          const deckRevealed = deckCandidates.slice(0, numDeckCards);

          // 3. Build reveal list: 1 hand card + (amount-1) deck cards
          const revealed: Card[] = [];
          if (realHandCard) {
            revealed.push(realHandCard);
          }
          revealed.push(...deckRevealed);

          // Shuffle reveal order so the real one isn't obvious
          const shuffledRevealed = this.utilityService.shuffle(revealed);

          if (sourceCard.isOpponent && game.cpuPlaying) {
            // CPU auto-picks (random, or prefer deck cards if you want)
            const chosen = this.utilityService.random(shuffledRevealed);
            if (outputLogs) console.log(`CPU guessing ${chosen.name}`);

            // Resolve draw for chosen card
            const chosenDeckIndex = enemy.deck.findIndex(c => c.instanceId === chosen.instanceId);
            if (chosenDeckIndex !== -1) {
              const actualCard = enemy.deck.splice(chosenDeckIndex, 1)[0];
              if (player.hand.length < 10) {
                player.hand.push(actualCard);
                this.reapplyHandAuras(player);
              } else {
                this.queuePendingAction(game, {
                  type: 'burn',
                  sourceCard: actualCard,
                  opponentTarget: player === game.opponent
                });
              }
            }
            break;
          }

          // Human player → queue revealAndChoose
          this.queuePendingAction(game, {
            type: 'revealAndGuess',
            sourceCard,
            effect,
            revealCards: shuffledRevealed,
            opponentTarget: sourceCard.isOpponent,
            prompt: 'Guess which card is in their hand'
          });

          if (outputLogs) console.log(`Revealed ${shuffledRevealed.length} cards for guess (1 from hand, rest from deck)`);
          break;
        }

        case 'revealAndChooseOpp':
        case 'revealAndChooseDeck':
        case 'revealAndChooseCost':
        case 'revealAndChoose':
          if (this.isCard(target)) {
            console.warn('revealAndChoose needs PlayerState target');
            break;
          }

          const player = target as PlayerState;
          const deck2 = effect.type === 'revealAndChooseOpp' ? 
            (player === game.player ? game.opponent.deck : game.player.deck) : 
            player.deck;

          if (deck2.length < (effect.amount ?? 3)) {
            if (outputLogs) console.log(`Not enough cards in deck to reveal ${(effect.amount ?? 3)}`);
            break;
          }

          let candidates: Card[] = [];
          if (effect.type === 'revealAndChooseCost' && effect.cost !== undefined) {
            let revealCost = effect.cost + (sourceCard.scaleDamage ?? 0);
            if ((effect.increment ?? 0) > 0) {
              sourceCard.scaleDamage = (sourceCard.scaleDamage ?? 0) + effect.increment!;
            }
            candidates = this.deckService.getAllCards()
              .filter(c => (c.currentCost ?? c.cost ?? 0) === revealCost);
            if (effect.subtypes && effect.subtypes.length > 0) {
              const requestedTypes = effect.subtypes.filter(t =>
                ["Creature", "Item", "Support", "Action"].includes(t)
              );
              if (requestedTypes.length > 0) {
                candidates = candidates.filter(c => 
                  requestedTypes!.includes(c.type)
                );
              }

              const requestedSubtypes = effect.subtypes.filter(t =>
                !["Creature", "Item", "Support", "Action"].includes(t)
              );
              if (requestedSubtypes.length > 0) {
                candidates = candidates.filter(c => 
                  c.subtypes?.some(sub => requestedSubtypes!.includes(sub))
                );
              }
            }
            candidates = this.utilityService.shuffle(candidates);
          } else if (effect.type === 'revealAndChooseDeck') {
            candidates = [...deck2];
          } else {
            candidates = this.utilityService.shuffle([...deck2]);
          }




          const revealed = candidates.slice(0, effect.amount ?? 3);

          if (sourceCard.isOpponent && game.cpuPlaying) {
            const oppCard = revealed[this.utilityService.random([0,1,2])];
            if (outputLogs) console.log(`opponent automatically selecting ${oppCard.name} from reveal options`);
            const chosenDeckIndex = deck2.indexOf(oppCard);
            if (chosenDeckIndex !== -1) {
              if (effect.type === 'revealAndChoose') deck2.splice(chosenDeckIndex, 1);
              game.lastCardDrawn = oppCard;
              if (player.hand.length < 10) {
                player.hand.push(oppCard);
                //this.handVersion++;
                this.reapplyHandAuras(player);
              } else {
                if (outputLogs) console.log(`burned ${oppCard.name} because hand is full`);
                //this.showBurnHint(oppCard, player === game.opponent);
                this.queuePendingAction(game, {
                    type: 'burn',
                    sourceCard: oppCard,
                    opponentTarget: player === game.opponent
                });
              }
            }
            if (outputLogs) console.log(`Drew ${oppCard.name} from Moment of Clarity reveal`);
            break;
          }

          // Show choice modal
          this.queuePendingAction(game, {
            type: 'revealAndChoose',
            sourceCard,
            effect,
            revealCards: revealed,
            opponentTarget: target === game.opponent,
            prompt: effect.type === 'revealAndChooseDeck' ? 
              'Choose one to draw. Discard the others.' :
              'Choose one to draw'
          });
          if (outputLogs) console.log(`Revealed ${revealed.length} cards for choice`);
          break;
        
        case 'playSupport': {
          let cardId: string | null;
          if (effect.names) {
            cardId = this.utilityService.random(effect.names);
          } else if (effect.cardId) {
            cardId = effect.cardId;
          }
          if (!cardId!) {
            if (outputLogs) console.log('no cardid for playSupport');
            break;
          }
          const newSupport = this.deckService.getCardById(cardId);
          const cloneSupport = this.deckService.cloneCardForGame(newSupport!,sourceCard.isOpponent!);
          owner.support.push(cloneSupport);
          this.applyCardAuras(game, cloneSupport, owner);
          cloneSupport.effects?.forEach(effect => {
            if (effect.trigger !== 'Summon') return;
  
            if (this.isAutoTarget(effect.target)) {
              this.executeEffect(effect, cloneSupport, game);
            } else {
              // Manual target → AI chooses intelligently
              const aiTarget = this.getSummonTarget(game, effect, cloneSupport, cloneSupport.isOpponent!);
              if (aiTarget) {
                this.executeEffect(effect, cloneSupport, game, aiTarget);
                if (outputLogs) console.log(`Automatically chose summon target: ${(aiTarget as any).name || 'face'}`);
              } else {
                if (outputLogs) console.log(`No valid summon target for: ${cloneSupport.name}`);
              }
            }
          });
          break;
        }

        case 'copyKeywordsDeck': {
          if (!this.isCard(target)) {
            console.warn('copyKeywordsDeck needs Card target');
            break;
          }
          const topCards = owner.deck.slice(0, effect.amount ?? 1);
          topCards.forEach(c => {
            const cKeywords = c.currentKeywords ?? [];
            if (cKeywords.length > 0) {
              if (outputLogs) console.log(`Added ${cKeywords.length} keywords to ${target.name}`);
              this.addUniqueKeywords(target, game, cKeywords);
            }
          });
          break;
        }

        case 'giveKeywordsToHandRandom': {
          if (!this.isCard(target)) {
            console.warn('giveKeywordsToHandRandom needs Card target');
            break;
          }
          const keywordsToAdd = target.currentKeywords ?? [];
          if (keywordsToAdd.length > 0) {
            let handTargets: Card[] = [];
            const targetHand = sourceCard.isOpponent ? game.opponent.hand : game.player.hand;
            targetHand.forEach(card => {
              if (card.type === 'Creature') {
                if (effect.subtypes && effect.subtypes.length > 0) {
                  if (card.subtypes?.some(sub => effect.subtypes!.includes(sub))) {
                    handTargets.push(card);
                  }
                } else {
                  handTargets.push(card);
                }
              }
            });
            if (handTargets.length === 0) {
              if (outputLogs) console.log('No valid targets in hand for giveKeywordsToHandRandom effect');
              break;
            } else {
              const finalTarget = this.utilityService.random(handTargets);
              this.addUniqueKeywords(finalTarget, game, keywordsToAdd);
              if (outputLogs) console.log(`Added keywords ${keywordsToAdd.join(', ')} from ${target.name} to ${finalTarget.name} in hand`);
            }
          } else {
            if (outputLogs) console.log('No keywords on target for giveKeywordsToHandRandom effect');
            break;
          }
          break;
        }

        case 'upgrade': {
          let originalCardId: string | null = null;
          let upgradeCardId: string | null = null;
          if (this.isCard(target)) {
            const upgradeEffect = target.effects?.find(e => e.type === 'upgrade');
            if (upgradeEffect) {
              originalCardId = target.id;
              upgradeCardId = upgradeEffect.cardId || null;
            }
          } else {
            originalCardId = sourceCard.id;
            upgradeCardId = effect.cardId || null;
          }
          if (originalCardId !== null && upgradeCardId !== null) {
            // Record the upgrade mapping
            owner.cardUpgrades[originalCardId] = upgradeCardId;
            //break;
            // Transform ALL copies in hand, deck, discard
            this.transformShoutCopies(owner.hand, originalCardId, upgradeCardId);
            this.transformShoutCopies(owner.deck, originalCardId, upgradeCardId);
            this.transformShoutCopies(owner.discard, originalCardId, upgradeCardId);
            if (outputLogs) console.log(`Upgraded all copies of ${originalCardId}`);
          } else {
            if (outputLogs) console.log('skipping upgrades');
          }
          break;
        }

        case 'shuffleCreaturesDiscard': {
          if (this.isCard(target)) {
            if (outputLogs) console.warn('shuffleCreaturesDiscard: invalid target (expected PlayerState)');
            break;
          }

          // Collect all creatures from discard
          const creaturesInDiscard = target.discard.filter(card => 
            card.type === 'Creature'
          );

          if (creaturesInDiscard.length === 0) {
            if (outputLogs) console.log('No creatures in discard to shuffle back');
            break;
          }

          if (outputLogs) console.log(`Shuffling ${creaturesInDiscard.length} creatures from discard back into deck`);

          // Remove creatures from discard
          target.discard = target.discard.filter(card => 
            card.type !== 'Creature'
          );

          // Add creatures back to deck
          target.deck.push(...creaturesInDiscard);

          // Shuffle the entire deck
          target.deck = this.utilityService.shuffle([...target.deck]);

          // Optional: log history
          /*this.logHistory(game, {
            player: target === game.player ? 'You' : 'Opponent',
            actionType: 'action-effect',
            description: `${target === game.player ? 'You' : 'Opponent'} shuffled ${creaturesInDiscard.length} creatures from discard into deck`,
            details: []
          });*/
          break;
        }

        case 'setPowerToHealth': {
          if (this.isCard(target)) {
            target.currentAttack = target.currentHealth;
          }
          break;
        }

        case 'setStats': {
          if (this.isCard(target)) {
            if (effect.modAttack !== undefined) {
              target.currentAttack = effect.modAttack;
            }
            if (effect.modHealth !== undefined) {
              target.currentHealth = effect.modHealth;
              target.maxHealth = effect.modHealth;
            }
          }
          break;
        }

        case 'buffDeck': {
          if (this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            break;
          }
          target.deck.forEach(c => {
            if (effect.subtypes && !effect.subtypes.includes(c.type)) return;
            if (c.type !== 'Item' && c.type !== 'Creature') return;
            c.currentAttack! += effect.modAttack ?? 0;
            c.currentHealth! += effect.modHealth ?? 0;
            c.maxHealth! += effect.modHealth ?? 0;
            //console.log(`buffed ${c.name} with ${effect.modAttack}/${effect.modHealth}`);
          });
          break;
        }

        case 'triggerSummon': {
          if (!this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            break;
          }
          target.effects?.forEach(effect => {
            if (effect.trigger !== 'Summon') return;

            if (this.isAutoTarget(effect.target)) {
              this.executeEffect(effect, target, game);
            } else {
              // Manual target → AI chooses intelligently
              const aiTarget = this.getSummonTarget(game, effect, target, target.isOpponent!);
              if (aiTarget) {
                this.executeEffect(effect, target, game, aiTarget);
                if (outputLogs) console.log(`Automatically chose summon target: ${(aiTarget as any).name || 'face'}`);
              } else {
                if (outputLogs) console.log(`No valid summon target for : ${target.name}`);
              }
            }
          });
        }

        case 'triggerSlay': {
          if (!game.creatureSlayer) {
            if (outputLogs) console.log('no slayer');
            break;
          }
          game.creatureSlayer.effects?.forEach(effect => {
            if (effect.trigger !== 'Slay') return;
            // Auto-target effects → resolve immediately
            if (this.isAutoTarget(effect.target)) {
              if (outputLogs) console.log('Slay triggered for: ', game.creatureSlayer!.name)
              this.executeEffect(effect, game.creatureSlayer!, game);
            } else {
              if (outputLogs) console.log('no auto target for slay target: ', effect.target)
            }
          });
          break;
        }

        case 'discardDeck': {
          if (this.isCard(target) || !effect.cardId) {
            if (outputLogs) console.log('invalid target for effect');
            break;
          }
          const cardIdToDiscard = effect.cardId === 'slain' ? game.creatureSlain!.id : effect.cardId;
          const indicesToRemove: number[] = [];
          const discarded: Card[] = [];

          target.deck.forEach((card, index) => {
            if (card.id === cardIdToDiscard) {
              indicesToRemove.push(index);
              // Clone to avoid shared reference issues
              const copyForDiscard = this.deckService.cloneCardForGame(card, card.isOpponent!);
              discarded.push(copyForDiscard);
            }
          });

          if (indicesToRemove.length === 0) {
            if (outputLogs) console.log(`No cards with ID ${cardIdToDiscard} found in deck`);
            break;
          }

          // Remove from deck in reverse order (so indices stay valid)
          indicesToRemove.sort((a, b) => b - a); // descending
          indicesToRemove.forEach(idx => {
            target.deck.splice(idx, 1);
          });

          // Add clones to discard
          target.discard.push(...discarded);

          if (outputLogs) console.log(`Discarded ${discarded.length} copies of ${cardIdToDiscard} from deck to discard`);

          break;
        }

        case 'discardHand': {
          if (this.isCard(target)) {
            if (outputLogs) console.log('invalid target for effect');
            break;
          }
          target.hand.forEach(card => {
            const originalCard = this.deckService.getCardById(card.id);
            const freshCopy = this.deckService.cloneCardForGame(originalCard!, target === game.opponent);
            target.discard.push(freshCopy);
          });
          target.hand = [];
          break;
        }

        case 'discard': {
          if (!this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            break;
          } 
          const playerIndex = owner.hand.indexOf(target);
          if (playerIndex >= 0) {
            owner.hand.splice(playerIndex,1);
            owner.discard.push(target);
            if (outputLogs) console.log(`discarded ${target.name} from hand`);
          }
          break;
        }

        case 'tradeHand': {
          if (enemy.hand.length === 0) {
            if (outputLogs) console.log('no card to trade');
            break;
          }
          if (!this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            break;
          }                 
          const randomOppCard = this.utilityService.random(enemy.hand);
          const randomOppIndex = enemy.hand.indexOf(randomOppCard);
          const playerIndex = owner.hand.indexOf(target);
          if (playerIndex >= 0 && randomOppIndex >= 0) {
            owner.hand.splice(playerIndex,1);
            enemy.hand.splice(randomOppIndex,1);
            randomOppCard.isOpponent = !randomOppCard.isOpponent;
            target.isOpponent = !target.isOpponent;
            owner.hand.push(randomOppCard);
            enemy.hand.push(target);
            if (outputLogs) console.log(`traded ${target.name} for ${randomOppCard.name} in opponent's hand`);
          } else {
            if (outputLogs) console.log('failed to trade cards');
          }
          break;
        }

        case 'addSubtype': {
          if (!this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            break;
          }
          effect.subtypes?.forEach(sub => {
            if (!target.subtypes?.includes(sub)) {
              target.subtypes.push(sub);
              if (sub === 'Werewolf') {
                this.addUniqueKeywords(target,game,['BeastForm']);
              }
            }
          });
          const ownerT = target.isOpponent ? game.opponent : game.player;
          this.applyCardAuras(game, target, ownerT);
          break;
        }

        case 'grantEffect': {
          if (!this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            return;
          }
          if (effect.grantedEffect) {
            target.effects?.push(effect.grantedEffect);
            if (outputLogs) console.log('granted effect: ',effect.grantedEffect, ' to ', target.name);
          }
          break;
        }

        case 'battle': {
          if (!this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            return;
          }
          let attacker: Card | null = null;
          let defender: Card | null = null;
          if (target.isOpponent === sourceCard.isOpponent) {
            attacker = target;
            defender = null; //need enemyCreaturewithHighestPower?
            const enemyCreatures = [...enemy.board[0],...enemy.board[1]]

            if (enemyCreatures.length === 0) {
              if (outputLogs) console.log('No valid enemy creatures to battle');
              return;
            }

            // Sort by currentAttack descending, pick first (highest)
            enemyCreatures.sort((a, b) => (b.currentAttack ?? 0) - (a.currentAttack ?? 0));
            defender = enemyCreatures[0];
          } else {
            attacker = sourceCard;
            defender = target;
          }
          this.resolveAttack(game, attacker, defender, true);
          break;
        }

        case 'stealAndReplace': {
          if (this.isCard(target)) {
            if (outputLogs) console.log('invalid target');
            break;
          }
          const opponent = target === game.opponent ? game.player : game.opponent;
          if (target.deck.length > 0) { 
            const stolenCard = target.deck.shift()!;
            stolenCard.isOpponent = !stolenCard.isOpponent;
            game.lastCardDrawn = stolenCard;
            if (opponent.hand.length < 10) {
              opponent.hand.push(stolenCard);
              this.runEffects('DrawCard', opponent, game);
              this.executeEffectsForCard('AddToHand',stolenCard, opponent, game);
            }
            if (effect.cardId) {
              const counterCard = this.deckService.getCardById(effect.cardId);
              const cloned = this.deckService.cloneCardForGame(counterCard!, !stolenCard.isOpponent);
              target.deck.unshift(cloned);
            }
          }
          break;
        }

        case 'change': {
          if (!effect.cardId) {
            if (outputLogs) console.log('no cardId for effect');
            break;
          }
          const newCard = this.deckService.getCardById(effect.cardId);
          if (!newCard) {
            if (outputLogs) console.log('invalid cardId for effect');
            break;
          }
          sourceCard.name = newCard.name;
          sourceCard.id = newCard.id;
          sourceCard.effects = [];
          if (newCard.effects?.length) {
            sourceCard.effects = [...newCard.effects];
          }
          sourceCard.text = newCard.text;
          if (sourceCard.type === 'Creature' && newCard.type === 'Creature') {
            if ((sourceCard.currentKeywords ?? []).includes('BeastForm')) {
              this.queuePendingAction(game, {
                  type: 'audio',
                  sourceCard: sourceCard,
                  prompt: 'beastform'
              });
            }
            sourceCard.subtypes = [...newCard.subtypes];
            if (newCard.immunity?.length) {
              newCard.immunity.forEach(sub => {
                if (!sourceCard.immunity?.includes(sub)) {
                  if (sourceCard.immunity) {
                    sourceCard.immunity.push(sub);
                  } else {
                    sourceCard.immunity = [sub];
                  }
                }
              });
            }
            const healthDiff = (newCard.health ?? 0) - (sourceCard.health ?? 0);
            const attackDiff = (newCard.attack ?? 0) - (sourceCard.attack ?? 0);
            const keywordsToAdd = newCard.keywords ?? [];
            sourceCard.health! += healthDiff;
            sourceCard.currentHealth! += healthDiff;
            sourceCard.maxHealth! += healthDiff;
            sourceCard.attack! += attackDiff;
            sourceCard.currentAttack! += attackDiff;
            if (keywordsToAdd.length) {
              this.addUniqueKeywords(sourceCard,game,keywordsToAdd);
            }
          } else if (sourceCard.type === 'Support' && newCard.type === 'Support') {
            sourceCard.uses = newCard.uses ?? 0;
          }
          this.applyCardAuras(game, sourceCard, owner);
          return;
        }

        case 'powerToLane': {
          if (!this.isCard(target)) {
            break;
          }
          game.lastCreatureTargeted = target;
          let refLane = target.laneIndex!;
          let amount = target.currentAttack!;
          if (amount > 0 && refLane >= 0) {
            [...game.player.board[refLane], ...game.opponent.board[refLane]].forEach(c => {
              if (target.instanceId === c.instanceId) return;
              const hasWard = c.currentKeywords?.includes('Ward');
              if (hasWard && amount > 0) {
                c.currentKeywords = c.currentKeywords?.filter(k => k !== 'Ward');
                c.effects?.forEach(effect2 => {
                  if (effect2.trigger !== 'WardBroken') return;
                    this.executeEffect(effect2, c, game);
                  });
              } else {
                if (amount > (c.currentHealth ?? 0)) {
                  const excess = amount - (c.currentHealth ?? 0);
                  if (outputLogs) console.log(`checking excess. is breakthrough? ${this.hasBreakthroughAura(owner)}`);
                  if (sourceCard.type === 'Action' && this.hasBreakthroughAura(owner) &&
                    c.isOpponent !== sourceCard.isOpponent) {
                      const ownerTarget = c.isOpponent ? game.opponent : game.player;
                      ownerTarget.health = Math.max(0,ownerTarget.health - excess);
                      if (outputLogs) console.log(`dealt ${excess} excess damage to face`);
                  }
                }
                c.currentHealth = Math.max(0, (c.currentHealth ?? 0) - amount);
                if (outputLogs) console.log(`Dealt ${amount} damage to ${c.name}`);
                if (amount > 0) {
                  game.lastCardReceivingDamage = c;
                  target.totalDamageDealt = (target.totalDamageDealt ?? 0) + amount;                
                  game.lastDamageTaken = amount;
                  c.effects?.forEach(effect2 => {
                  if (effect2.trigger !== 'DamageTaken') return;
                    this.queuePendingAction(game, {
                        type: 'audio',
                        sourceCard: c,
                        prompt: 'hit'
                    });
                    this.executeEffect(effect2, c, game);
                  });
                  target.effects?.forEach(effect2 => {
                  if (effect2.trigger !== 'DamageDealt') return;
                    this.executeEffect(effect2, target, game);
                  });
                }
              }
            });
            
          }
          game.lastCardDealingDamage = target;
          this.breakRunesIfNeeded(game, owner === game.opponent ? game.player : game.opponent);
          const deathsBefore = this.currentDeathTotalThisTurn;
          this.checkCreatureDeath(game);
          const deathsAfter = this.currentDeathTotalThisTurn;
          if (deathsAfter !== deathsBefore) {
            this.checkCreatureDeath(game);
          }
          break;
        }

        case 'winGame':
          this.handleGameOver(game, sourceCard.isOpponent!);
          return;

        case 'maxMagicka': {
          if (this.isCard(target)) {
            console.warn('maxMagicka effect targeting a card — likely a misconfigured effect');
            break;
          }
          let magickaAmount = effect.amount ?? 0;
          if (this.hasDoubleMagickaAura(target)) magickaAmount *= 2;
          target.maxMagicka = (target.maxMagicka ?? 0) + magickaAmount;
          this.runEffects('MaxMagickaIncreased',target, game);
          this.updateStaticBuffs(game, target);
          break;
        }

        case 'magicka': {
          if (this.isCard(target)) {
            if (outputLogs) console.warn('maxMagicka effect targeting a card — likely a misconfigured effect');
            break;
          }
          target.currentMagicka = (target.currentMagicka ?? 0) + (effect.amount ?? 0);
          break;
        }
        
        case 'addTempCost': {
          if (this.isCard(target)) {
            if (outputLogs) console.warn("addTempCost effect used with unsupported target:", effect.target);
            return;
          }
          const modAmount = effect.amount ?? 0;
          target.tempCost = target.tempCost + modAmount;
          target.hand.forEach(c => {
            c.currentCost = (c.currentCost ?? c.cost) + modAmount;
          });
          break;
        }

        case 'modCost': {
          if (!this.isCard(target)) {
            if (outputLogs) console.warn("modCost effect used with unsupported target:", effect.target);
            return;
          }
          let adjustment = effect.amount ?? 0;
          let adjScalar = 1;
          if (effect.amountPer) {
            adjScalar = this.getAmountPer(game, effect.amountPer, sourceCard);
            if (outputLogs) console.log('effect type: ', effect.type, ' triggered ', adjScalar, 'x');
          }
          adjustment = adjustment * adjScalar;

          // Check condition
          if (effect.condition?.type === 'drawnCardCost') { 
            if  ((target.cost ?? target.currentCost ?? 0) >= (effect.condition.min ?? 0)) {
              
              const amount = effect.amount ?? 0;
              target.currentCost = Math.max(0, (target.currentCost ?? target.cost ?? 0) + amount);

              if (outputLogs) console.log(`Reduced cost of drawn card ${target.name} to ${target.currentCost}`);
            } else {
              if (outputLogs) console.log("Last card drawn not high enough cost for trigger");
              return;
            }
          } else {
            // Apply the cost modification
            target.currentCost = Math.max(0, (target.currentCost ?? target.cost ?? 0) + adjustment);
          }

          
          if (outputLogs) console.log(
            `Modified cost of ${target.name} by ${adjustment}: ` +
            `${target.currentCost ?? target.cost} (from ${target.cost})`
          );

          // Optional: if you want the change to be temporary (end of turn), track it
          // But for Thieves Guild Recruit, it's permanent until played or discarded
          break;
        }

        case 'buffSubtype': {
          if (this.isCard(target)) {
            owner.board.forEach(pl => {
              pl.forEach(c => {
                if (target.subtypes.some(s => c.subtypes.includes(s))) {
                  const attackBuff = effect.modAttack ?? 0;
                  const healthBuff = effect.modHealth ?? 0;
                  c.currentAttack = (c.currentAttack ?? 0) + attackBuff;
                  c.currentHealth = (c.currentHealth ?? 0) + healthBuff;
                  c.maxHealth = (c.maxHealth ?? 0) + healthBuff;
                  if (outputLogs) console.log(`Buffed ${c.name}: +${attackBuff}/+${healthBuff}`);
                }
              });
            });
          }
          break;
        }

        case 'buffTarget':
        case 'buffSelf':
          if (this.isCard(target)) {
            if ((target.currentHealth ?? 0) <= 0) {
              if (outputLogs) console.log(`${target.name} should already be dead. can't buff`);
              break;
            }
            const attackBuff = effect.modAttack ?? 0;
            const healthBuff = effect.modHealth ?? 0;
            const keywordsToAdd = effect.addKeywords ?? [];
            const tempAttackBuff = effect.tempAttack ?? 0;
            const tempHealthBuff = effect.tempHealth ?? 0;
            const tempKeywordsToAdd = effect.tempKeywords ?? [];
            const keywordsToRemove = effect.removeKeywords ?? [];
            let modScalar = 1;
            if (effect.amountPer) {
              modScalar = this.getAmountPer(game, effect.amountPer, sourceCard, targetLane);
              if (effect.amountPer === 'numberKeywords') {
                modScalar = this.getAmountPer(game, effect.amountPer, target, targetLane);
              }
              if (outputLogs) console.log('effect type: ', effect.type, ' triggered ', modScalar, 'x');
            }
            const debuffMod = this.getDebuffModifier(owner);
            let attackMod = (attackBuff + tempAttackBuff)*modScalar;
            let healthMod = (healthBuff + tempHealthBuff)*modScalar;
            if (attackMod < 0) attackMod = attackMod + debuffMod;
            if (healthMod < 0) healthMod = healthMod + debuffMod;
            let tempAttackMod = tempAttackBuff*modScalar;
            let tempHealthMod = tempHealthBuff*modScalar;
            if (tempAttackMod < 0) tempAttackMod = tempAttackMod + debuffMod;
            if (tempHealthMod < 0) tempHealthMod = tempHealthMod + debuffMod;

            target.currentAttack = (target.currentAttack ?? 0) + attackMod;
            target.currentHealth = (target.currentHealth ?? 0) + healthMod;
            target.maxHealth = (target.maxHealth ?? 0) + healthMod;
            this.addUniqueKeywords(target, game, keywordsToAdd);
            this.addUniqueKeywords(target, game, tempKeywordsToAdd);
            keywordsToRemove.forEach(w => {
              target.currentKeywords = (target.currentKeywords ?? []).filter(k => k !== w);
              if (w === 'Cover') {
                target.covered = false;
              }
            });
            if (effect.tempAttack) target.tempAttack = (target.tempAttack ?? 0) + tempAttackMod;
            if (effect.tempHealth) target.tempHealth = (target.tempHealth ?? 0) + tempHealthMod;
            if (effect.tempKeywords) {
              target.tempKeywords = Array.from(
                new Set([
                  ...(target.tempKeywords ?? []),
                  ...(tempKeywordsToAdd)
                ])
              );
            }
            if (outputLogs) console.log(`Buffed ${target.name}: +${attackBuff}/+${healthBuff}`);
          }
          break;
        
        case 'grantRandomKeyword': {
          //console.log('trying to grant keyword');
          if (!this.isCard(target)) return;
          let numKeywordsToAdd = effect.amount ?? 1;
          for (let i = 0; i < numKeywordsToAdd; i++) {
            // Pick one random keyword from your allowed list
            const randomKeyword = this.utilityService.random(this.keywordList);
            this.addUniqueKeywords(target, game, [randomKeyword]);
            if (outputLogs) console.log(`${sourceCard.name} granted random keyword '${randomKeyword}' to ${target.name}`);
          }
          break;
        }

        case 'damage': {
          let amount = effect.amount ?? 0;
          let dmgScalar = 1;
          if (effect.amountPer) {
            dmgScalar = this.getAmountPer(game, effect.amountPer, sourceCard, targetLane);
            if (outputLogs) console.log('effect type: ', effect.type, ' triggered ', dmgScalar, 'x');
          }
          amount *= dmgScalar;
          amount += (sourceCard.scaleDamage ?? 0);
          //increment next damage call if effect has increment property
          if ((effect.increment ?? 0) > 0) {
            sourceCard.scaleDamage = (sourceCard.scaleDamage ?? 0) + effect.increment!;
          }
          if (this.isCard(target)) {
            game.lastCreatureTargeted = target;
            if (target.immunity?.includes('ActionDamage') && sourceCard.type === 'Action') amount = 0;
            if (target.immunity?.includes('SupportDamage') && sourceCard.type === 'Support') amount = 0;
            const hasWard = target.currentKeywords?.includes('Ward');
            if (hasWard && amount > 0) {
              target.currentKeywords = target.currentKeywords?.filter(k => k !== 'Ward');
              target.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'WardBroken') return;
                  this.executeEffect(effect2, target, game);
                });
            } else {
              if (amount > (target.currentHealth ?? 0)) {
                const excess = amount - (target.currentHealth ?? 0);
                if (outputLogs) console.log(`checking excess. is breakthrough? ${this.hasBreakthroughAura(owner)}`);
                if (sourceCard.type === 'Action' && this.hasBreakthroughAura(owner) &&
                  target.isOpponent !== sourceCard.isOpponent) {
                    const ownerTarget = target.isOpponent ? game.opponent : game.player;
                    ownerTarget.health = Math.max(0,ownerTarget.health - excess);
                    if (outputLogs) console.log(`dealt ${excess} excess damage to face`);
                }
              }
              target.currentHealth = Math.max(0, (target.currentHealth ?? 0) - amount);
              if (outputLogs) console.log(`Dealt ${amount} damage to ${target.name}`);
              if (amount > 0) {
                game.lastCardReceivingDamage = target;
                sourceCard.totalDamageDealt = (sourceCard.totalDamageDealt ?? 0) + amount;                
                game.lastDamageTaken = amount;
                target.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'DamageTaken') return;
                  this.queuePendingAction(game, {
                      type: 'audio',
                      sourceCard: target,
                      prompt: 'hit'
                  });
                  this.executeEffect(effect2, target, game);
                });
                sourceCard.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'DamageDealt') return;
                  this.executeEffect(effect2, sourceCard, game);
                });
                if (sourceCard.currentKeywords?.includes('Lethal')) {
                  console.log(`${effect.trigger} from ${sourceCard.name} killed ${target.name} with lethal`);
                  target.currentHealth = 0;
                }
              }
            }
          } else if (target) {
            if (amount > 0 && this.hasActionImmunityAura(target) && sourceCard.type === 'Action') amount = 0;
            if (amount > 0 && this.hasSupportImmunityAura(target) && sourceCard.type === 'Support') amount = 0;
            if (amount > 0) {
              target.damageTaken += amount;
              sourceCard.totalDamageDealt = (sourceCard.totalDamageDealt ?? 0) + amount;
              game.lastCardReceivingDamage = null;
              sourceCard.effects?.forEach(effect2 => {
              if (effect2.trigger !== 'DamageDealt') return;
                this.executeEffect(effect2, sourceCard, game);
              });
              game.healthJustGained = 0;
              if (outputLogs) console.log(`Dealt ${amount} damage to ${target === game.opponent ? 'opponent' : 'player'}`);
            } else {
              if (outputLogs) console.log(`Healed ${amount} damage to ${target === game.opponent ? 'opponent' : 'player'}`);
              game.healthJustGained = -amount;
            }
            target.health = Math.min(99,Math.max(0, target.health - amount));
            if (game.healthJustGained > 0) this.runEffects('HealPlayer',target, game);
          }
          game.lastCardDealingDamage = sourceCard;
          this.breakRunesIfNeeded(game, owner === game.opponent ? game.player : game.opponent);
          const deathsBefore = this.currentDeathTotalThisTurn;
          this.checkCreatureDeath(game);
          const deathsAfter = this.currentDeathTotalThisTurn;
          if (deathsAfter !== deathsBefore) {
            this.checkCreatureDeath(game);
          }
          break;
        }

        case 'shackle':
        case 'freeze':
          if (this.isCard(target)) {
            if (!target.immunity?.includes('Shackle')) {
              target.shackled = true;
              if (effect.type === 'freeze') {
                target.frozen = true;
              }
              if (outputLogs) console.log(`Shackled ${target.name}`);
              game.creatureShackled = target;
              let applyTempShackle = false;
              if (sourceCard.isOpponent === target.isOpponent) applyTempShackle = true; //shackled yourself
              if (game.player.turn && !target.isOpponent) applyTempShackle = true; //got shackled on your turn
              if (game.opponent.turn && target.isOpponent) applyTempShackle = true; //got shackled on your turn
              if (applyTempShackle) { //used to keep shackle from immediately clearing at end of your turn
                  target.tempKeywords = Array.from(
                    new Set([
                      ...(target.tempKeywords ?? []),
                      ...(['Shackled'])
                    ])
                  );
              }
              const oppPlayer = target.isOpponent ? game.player: game.opponent;
              this.runEffects("EnemyShackle",oppPlayer, game);
            }
          }
          break;   

        case 'unsummon':
        case 'silence':
          if (this.isCard(target) && target.type === 'Creature') {
            const ownerTarget = target.isOpponent ? game.opponent : game.player;
            //console.log(`${target.name} immunity is ${target.immunity ?? []}`);
            if (effect.type === 'silence' && 
              target.immunity?.includes('Silence')) {
              if (outputLogs) console.log('target immune to silence');
              return;
            }
            if (target.attachedItems?.length) {
              target.attachedItems.forEach(item => {
                const originalItem = this.deckService.getCardById(item.id);
                const freshItem = this.deckService.cloneCardForGame(originalItem!, item.isOpponent || false);
                ownerTarget.discard.push(freshItem);   
                freshItem.effects?.forEach(effect2 => {
                  if (effect2.trigger !== 'LastGasp') return;
                  // Auto-target effects → resolve immediately
                  if (this.isAutoTarget(effect2.target)) {
                    if (outputLogs) console.log('Last Gasp triggered for: ', freshItem.name)
                    this.executeEffect(effect2, target, game);
                  } else {
                    if (outputLogs) console.log('no auto target for last gasp target: ', effect2.target)
                  }
                });
              });
              target.attachedItems = [];
            }
            this.reverseAurasOnTarget(game,target);
            if (effect.type === 'silence') {
              target.currentKeywords = [];
              target.currentAttack = target.attack;
              target.maxHealth = target.health;
              if (target.currentHealth! > target.maxHealth!) {
                target.currentHealth = target.maxHealth;
              }
              target.tempAttack = 0;
              target.tempHealth = 0;
              target.tempKeywords = [];
              target.shackled = false;
              target.frozen = false;
              target.covered = false;
              target.immunity = [];
              target.effects = [];
              target.silenced = true;
              target.static = undefined;
              //reapply any aura effects to this card after it was silenced
              this.applyCardAuras(game, target, ownerTarget);
              if (outputLogs) console.log(`Silenced ${target.name}`);
            } else if (effect.type === 'unsummon') {
              const newCardToAdd = this.deckService.getCardById(target.id);
              const clonedToAdd = this.deckService.cloneCardForGame(newCardToAdd!,target.isOpponent!);
              if (ownerTarget.hand.length >= 10) {
                if (outputLogs) console.log('hand full. removing card from game');
                //this.showBurnHint(target, ownerTarget === game.opponent);
                this.queuePendingAction(game, {
                    type: 'burn',
                    sourceCard: clonedToAdd,
                    opponentTarget: ownerTarget === game.opponent
                });
                return;
              } else {
                ownerTarget.hand.push(clonedToAdd);
                //this.handVersion++;
                this.reapplyHandAuras(ownerTarget);
              }
              const location = this.findCardLocation(game, target);
              // 1. Remove from location
              switch (location!.type) {
                case 'board':
                  const laneLoc = ownerTarget.board[location!.laneIndex!];
                  const laneIdx = laneLoc.indexOf(target);
                  if (laneIdx !== -1) {
                    laneLoc.splice(laneIdx, 1);
                  }
                  break;

                case 'support':
                  const supportIdx = owner.support.indexOf(target);
                  if (supportIdx !== -1) {
                    ownerTarget.support.splice(supportIdx, 1);
                  }
                  break;
              }
            }
          }
          break;

        case 'tempModCost': {
          if (!this.isCard(target)) {
            let costAdj = effect.amount ?? 0;
            if (costAdj !== 0) {
              target.hand.forEach(cardInHand => {
                cardInHand.currentCost = (cardInHand.currentCost ?? cardInHand.cost ?? 0) + costAdj;
              });
              game.tempCostAdjustment = costAdj;
            }
          }
          break;
        }

        case 'destroy': {
          if (this.isCard(target)) {
            game.lastCreatureTargeted = target;
            this.destroyCard(game, target, sourceCard);
            if (outputLogs) console.log(`Destroyed ${target.name}`);
          }
          break;
        }

        case 'markForDeath': {
          if (this.isCard(target)) target.endOfTurn = 'destroy';
          break;
        }

        case 'drawFilteredPower':
        case 'drawFiltered':
        case 'drawCards':
        case 'drawFull':
        case 'drawAndReduceCost':
        case 'discardTopDeck':
          let drawAmount = effect.amount ?? 1;
          let drawScalar = 1;
          if (effect.amountPer) {
            drawScalar = this.getAmountPer(game, effect.amountPer, sourceCard, targetLane);
            if (outputLogs) console.log('effect type: ', effect.type, ' triggered ', drawScalar, 'x');
          }
          drawAmount *= drawScalar;
          if (effect.type === 'discardTopDeck') {
            if (!this.isCard(target)) {
              const discardCard = target.deck.shift();
              target.discard.push(discardCard!);
            }
          }
          if (effect.type === 'drawFull') {
            if (!this.isCard(target)) this.drawCards(target, 10, game, true);
          } else if (effect.type === 'drawCards' || effect.type === 'drawAndReduceCost' ||
            effect.type === 'discardTopDeck'
          ) {
            if (!this.isCard(target)) this.drawCards(target, drawAmount, game);
            if (effect.type === 'drawAndReduceCost' && game.lastCardDrawn) {
              game.lastCardDrawn.currentCost = (game.lastCardDrawn.currentCost ?? game.lastCardDrawn.cost ?? 0) + (effect.modCost ?? 0);
            }
          } else if (effect.type === 'drawFiltered') {
            if (!this.isCard(target)) this.drawFilteredCards(target, drawAmount, game,
              effect.cost ?? undefined, effect.subtypes ?? undefined);
          } else if (effect.type === 'drawFilteredPower') {
            //console.log(`source power for attack is ${sourceCard.currentAttack}`);
            if (!this.isCard(target)) this.drawFilteredCards(target, drawAmount, game,
              sourceCard.currentAttack ?? undefined, effect.subtypes ?? undefined);
          }
          break; 
        
        case 'drawFromDiscard': {
          if (!this.isCard(target)) {
            const gyIndex = target.discard.findIndex(c => c.instanceId === sourceCard.instanceId);
            if (gyIndex === -1) {
              if (outputLogs) console.log(`drawFromDiscard: ${sourceCard.id} not found in discard`);
              break;
            }
            const drawnCard = target.discard.splice(gyIndex, 1)[0];
            game.lastCardDrawn = drawnCard;
            if (target.hand.length >= 10) {
              if (outputLogs) console.log(`Drew ${drawnCard.name} from discard, but hand full!`);
              //this.showBurnHint(drawnCard, target === game.opponent);

                this.queuePendingAction(game, {
                    type: 'burn',
                    sourceCard: drawnCard,
                    opponentTarget: target === game.opponent
                });
              break;
            } else {
              //this.handVersion++;
              target.hand.push(drawnCard);

              this.reapplyHandAuras(target);
              if (outputLogs) console.log(`Drew ${drawnCard.name} from discard to hand`);
            }
            /*this.logHistory(game,{
              player: target === game.player ? 'You' : 'Opponent',
              actionType: 'draw-effect',
              description: `${target === game.player ? 'You' : 'Opponent'} drew ${drawnCard.name} from discard`,
              details: []
            });*/
          }
          break;
        }
        
        case 'addCounter': {
          if (this.isCard(target)) {
            target.counter = (target.counter ?? 0) + 1;
            if (outputLogs) console.log(`${target.name} is at count: ${target.counter}`);
          }
          break;
        }

        case 'drawCardsProphecy': {
          if (this.isCard(target)) return;
          this.drawForProphecy(game, target);
          break;
        }
        
        case 'drawRandomOpp':
        case 'shuffleIntoDeck':
        case 'addToHand':
          let oppBool = owner === game.opponent;
          if (this.isCard(target)) {
            if (effect.type === 'shuffleIntoDeck' && effect.target === 'self') {
              target.currentHealth = target.maxHealth;
              owner.deck.push(target);
              owner.deck = this.utilityService.shuffle(owner.deck);
              return;
            }
            const clonedCreature = this.deckService.cloneCardForGame(target, oppBool);
            if (effect.type === 'addToHand') {
                clonedCreature.currentCost! += owner.tempCost;
                game.lastCardDrawn = clonedCreature;
                if (owner.hand.length < 10) {
                    owner.hand.push(clonedCreature);
                    //this.handVersion++;
                    this.reapplyHandAuras(owner);
                } else {
                    //this.showBurnHint(clonedCreature, owner === game.opponent);

                    this.queuePendingAction(game, {
                        type: 'burn',
                        sourceCard: clonedCreature,
                        opponentTarget: owner === game.opponent
                    });
                }
            }
            return;
          }
          let cardToAdd: Card | undefined;
          let cardId = effect.cardId;
          if (effect.type === 'drawRandomOpp') {
            const oppDeck = enemy.deck;
            if (oppDeck.length === 0) {
              if (outputLogs) console.log('Opponent deck empty — cannot drawRandomOpp');
              break;
            }
            let candidates = [...oppDeck];
            // Apply filter if subtypes provided
            if (effect.subtypes?.length) {
              const isTypeFilter = effect.subtypes.every(s => 
                ['Action', 'Item', 'Creature', 'Support'].includes(s)
              );
              if (isTypeFilter) {
                // Filter by type
                candidates = candidates.filter(c => effect.subtypes!.includes(c.type));
              } else {
                // Filter by subtypes
                candidates = candidates.filter(c => 
                  c.subtypes?.some(sub => effect.subtypes!.includes(sub))
                );
              }
            }
            if (candidates.length === 0) {
              if (outputLogs) console.log(`No cards in opponent deck match subtypes: ${effect.subtypes?.join(', ')}`);
              cardToAdd = this.deckService.getCardById('chicken');
              cardId = 'chicken';
            } else {
              // Pick random from filtered candidates
              cardToAdd = this.utilityService.random(candidates);
              cardId = cardToAdd.id;
            }
          }
          if (cardId) {
            if (cardId === 'randomCost') {
              cardToAdd = this.deckService.getRandomCardByCost(effect.cost ?? 0, "equal");
            } else {
              cardToAdd = this.deckService.getCardById(cardId);
            }
          } else if (effect.subtypes && effect.subtypes.length > 0) {
            cardToAdd = this.deckService.getRandomCardBySubtypes(effect.subtypes);
          } else if (effect.names && effect.names.length > 0) {
            cardToAdd = this.deckService.getRandomCardByNames(effect.names);
          } else {
            console.warn("addToHand effect missing cardId, subtypes");
            return;
          }
          if (!cardToAdd) {
            console.warn(`Card not found for addToHand`);
            return;
          }
          const numToAdd = effect.amount ?? 1;
          oppBool = target === game.opponent;
          for (let i = 0; i < numToAdd; i++) {
            const cloned = this.deckService.cloneCardForGame(cardToAdd, oppBool);
            this.applyCardUpgrades(owner,cloned);
            cloned.currentCost = (cloned.currentCost ?? cloned.cost) + (effect.modCost ?? 0);
            cloned.currentCost += target.tempCost;
            if (effect.type === 'addToHand' || effect.type === 'drawRandomOpp') {
                game.lastCardDrawn = cloned;
                if (target.hand.length < 10) {
                    target.hand.push(cloned);
                    //this.handVersion++;
                    this.reapplyHandAuras(target);
                    this.executeEffectsForCard('AddToHand',cloned, target, game);
                } else {
                    //this.showBurnHint(cloned, target === game.opponent);

                    this.queuePendingAction(game, {
                        type: 'burn',
                        sourceCard: cloned,
                        opponentTarget: target === game.opponent
                    });
                }
            } else if (effect.type === 'shuffleIntoDeck') {
              target.deck.push(cloned);
              target.deck = this.utilityService.shuffle(target.deck);
            }
          }
          if (outputLogs) console.log(`Added ${numToAdd}x ${cardToAdd.name} to ${oppBool ? 'opponent' : 'player'}`);
          break;

        case 'extraAttack': {
          if (this.isCard(target)) {
            target.attacks = (target.attacks ?? 0) + 1;
          }
          break;
        }

        case 'extraUse': {
          if (this.isCard(target) && target.type === 'Support') {
            target.uses = (target.uses ?? 0) + 1;
          }
          break;
        }

        case 'moveAll': {
          if (this.isCard(target)) {
            console.warn('moveAll: invalid target (expected PlayerState)');
            break;
          }

          // Get both lanes
          const lane0 = target.board[0];
          const lane1 = target.board[1];

          if (lane0.length === 0 && lane1.length === 0) {
            if (outputLogs) console.log('moveAll: no creatures to move');
            break;
          }

          if (outputLogs) console.log(`moveAll: swapping ${lane0.length} creatures from lane 0 and ${lane1.length} from lane 1`);

          // Step 1: Collect all creatures that will move
          const allMovingCreatures = [...lane0, ...lane1];

          // Step 2: Clear both lanes
          target.board[0] = [];
          target.board[1] = [];

          // Step 3: Swap lanes — move lane0 creatures to lane 1, lane1 to lane 0
          lane0.forEach(creature => {
            creature.laneIndex = 1;
            target.board[1].push(creature);
          });

          lane1.forEach(creature => {
            creature.laneIndex = 0;
            target.board[0].push(creature);
            
          });

          // Step 4: Trigger 'MoveCreature' effects for EVERY moved creature
          allMovingCreatures.forEach(creature => {
            // Trigger lane-specific effects (e.g. enter new lane, leave old lane)
            this.runEffects('MoveCreature', target, game);
          });

          // Step 5: If you have a global 'Move' trigger on each card
          // (e.g. "Whenever this creature moves" — not lane-specific)
          allMovingCreatures.forEach(creature => {
            creature.effects?.forEach(effect => {
              if (effect.trigger === 'Move') {
                this.executeEffect(effect, creature, game);
              }
            });
            const beforeCovered = creature.covered;
            // Re-apply any lane-specific effects (auras, cover, etc.)
            if (!creature.covered) creature.covered = game.laneTypes[creature.laneIndex!] === 'Shadow' && 
              !creature.currentKeywords?.includes('Guard') &&
              !creature.immunity?.includes('Cover');
            const afterCovered = creature.covered;
            if (!beforeCovered && afterCovered) {
              creature.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'GainCover') return;
                // Auto-target effects → resolve immediately
                if (this.isAutoTarget(effect2.target)) {
                  if (outputLogs) console.log('Covered triggered for: ', creature.name)
                  this.executeEffect(effect2, creature, game);
                } else {
                  if (outputLogs) console.log('no auto target for covered target: ', effect2.target)
                }
              });
            }
          });

          // Optional: Log history
          /*this.logHistory(game, {
            player: target === game.player ? 'You' : 'Opponent',
            actionType: 'move-effect',
            description: `${target === game.player ? 'You' : 'Opponent'} swapped all creatures between lanes`,
            details: [`Moved ${allMovingCreatures.length} creatures`]
          });*/

          // Optional: re-apply any lane auras or static buffs after move
          this.updateStaticBuffs(game, target);

          break;
        }

        case 'transpose':
        case 'move':
          if (!this.isCard(target)) {
            if (outputLogs) console.warn('Move effect can only target cards (creatures/support)');
            break;
          }
          if (target.type !== 'Creature') {
            if (outputLogs) console.warn(`Move effect on unsupported type: ${target.type}`);
            break;
          }
          // Default behavior: move creature to the other lane
          if (target.type === 'Creature') {
            if (target.laneIndex === undefined) {
              if (outputLogs) console.warn(`Cannot move creature without laneIndex: ${target.name}`);
              break;
            }
            const currentLane = target.laneIndex;
            const targetLane = 1 - currentLane; // flip 0 ↔ 1
            const owner = target.isOpponent ? game.opponent : game.player;
            // Check if target lane has space
            if (owner.board[targetLane].length >= 4) {
              if (outputLogs) console.log(`Cannot move ${target.name} to lane ${targetLane} — lane full`);
              break;
            }
            // Remove from current lane
            const currentLaneArray = owner.board[currentLane];
            const idx = currentLaneArray.indexOf(target);
            if (idx !== -1) {
              currentLaneArray.splice(idx, 1);
            }
            // Update laneIndex
            target.laneIndex = targetLane;
            const beforeCovered = target.covered;
            // Re-apply any lane-specific effects (auras, cover, etc.)
            if (!target.covered) target.covered = game.laneTypes[targetLane] === 'Shadow' && 
              !target.currentKeywords?.includes('Guard') &&
              !target.immunity?.includes('Cover');
            const afterCovered = target.covered;
            // Add to new lane
            owner.board[targetLane].push(target);
            if (effect.type === 'move') game.creatureMoved = target;
            /*this.logHistory(game,{
              player: owner === game.player ? 'You' : 'Opponent',
              actionType: 'move-effect',
              description: `${owner === game.player ? 'You' : 'Opponent'}: ${sourceCard.name} moved ${target.name} to a different lane`,
              details: [`From lane ${game.laneTypes[currentLane]} to lane ${game.laneTypes[targetLane]}`]
            });*/
            if (outputLogs) console.log(`Moved ${target.name} from lane ${currentLane} to lane ${targetLane}`);
            if (!beforeCovered && afterCovered) {
              target.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'GainCover') return;
                // Auto-target effects → resolve immediately
                if (this.isAutoTarget(effect2.target)) {
                  if (outputLogs) console.log('Covered triggered for: ', target.name)
                  this.executeEffect(effect2, target, game);
                } else {
                  if (outputLogs) console.log('no auto target for covered target: ', effect2.target)
                }
              });
            }
            if (effect.type === 'move') {
              target.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'Move') return;
                // Auto-target effects → resolve immediately
                if (this.isAutoTarget(effect2.target)) {
                  if (outputLogs) console.log('Move triggered for: ', target.name)
                  this.executeEffect(effect2, target, game);
                } else {
                  if (outputLogs) console.log('no auto target for move target: ', effect2.target)
                }
              });
              this.runEffects('MoveCreature',owner, game);
            } else if (effect.type === 'transpose') {
              target.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'Summon') return;
      
                if (this.isAutoTarget(effect2.target)) {
                  this.executeEffect(effect2, target, game);
                } else {
                  // Manual target → AI chooses intelligently
                  const aiTarget = this.getSummonTarget(game, effect2, target, target.isOpponent!);
                  if (aiTarget) {
                    this.executeEffect(effect2, target, game, aiTarget);
                    if (outputLogs) console.log(`Automatically chose summon target: ${(aiTarget as any).name || 'face'}`);
                  } else {
                    if (outputLogs) console.log(`No valid summon target for: ${target.name}`);
                  }
                }
              });
            }
          }
          break;

        case 'equip':
        case 'equipRandom':
        case 'equipDiscard':
        case 'equipCard':
        case 'equipCopy':
          const count = effect.amount ?? 1;
          const discard = owner.discard || []; // assume you have a discard pile array
          let toEquip: Card[] | null = null;

          if (effect.type === 'equipDiscard') {
            const itemsInDiscard = discard.filter(c => c.type === 'Item');
            if (itemsInDiscard.length === 0) {
              if (outputLogs) console.log("No items in discard to equip");
              break;
            }
            // Sort by cost (highest first)
            itemsInDiscard.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));

            // Take the top N
            toEquip = itemsInDiscard.slice(0, count);
          } else if (effect.type === 'equipRandom') {
            toEquip = [this.deckService.getRandomCardBySubtypes(["Item"])!];
          } else if (effect.type === 'equip' && effect.cardId) {
            toEquip = [this.deckService.getCardById(effect.cardId)!];
          } else if (effect.type === 'equipCopy') {
            //console.log('trying equip copy');
            toEquip = [this.deckService.getCardById(game.lastCardEquipped!.id)!];
          } else if (effect.type === 'equipCard' && sourceCard.type === 'Item') {
            toEquip = [sourceCard];
          }
          if (toEquip !== null) {
            toEquip.forEach(item => {
              // Equip logic (same as normal item equip)
              if (!this.isCard(target)) return;
              target.currentAttack = (target.currentAttack ?? 0) + (item.currentAttack ?? item.attack ?? 0);
              target.currentHealth = (target.currentHealth ?? 0) + (item.currentHealth ?? item.health ?? 0);
              target.maxHealth = (target.maxHealth ?? 0) + (item.currentHealth ?? item.health ?? 0);

              this.addUniqueKeywords(target, game, item.keywords ?? []);
              const tempKeywordsToAdd = item.tempKeywords ?? [];
              this.addUniqueKeywords(target, game, tempKeywordsToAdd);

              if (item.tempKeywords) {
                target.tempKeywords = Array.from(
                  new Set([
                    ...(target.tempKeywords ?? []),
                    ...(tempKeywordsToAdd)
                  ])
                );
              }
              if (item.immunity) {
                target.immunity = Array.from(
                  new Set([
                    ...(target.immunity ?? []),
                    ...(item.immunity ?? [])
                  ])
                );
              }

              target.attachedItems = target.attachedItems || [];
              target.attachedItems.push({ ...item });
              if (effect.type !== 'equipCopy') {
                game.lastCardEquipped = item;
                this.runEffects('EquipFriendly',owner,game);
              }

              target.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'EquipItem') return;
                // Auto-target effects → resolve immediately
                if (this.isAutoTarget(effect2.target)) {
                  if (outputLogs) console.log('Equip Item triggered for: ', target.name)
                  this.executeEffect(effect2, target, game);
                } else {
                  if (outputLogs) console.log('no auto target for slay target: ', effect2.target)
                }
              });

              item.effects?.forEach(effect2 => {
                if (effect2.trigger !== 'Summon') return;

                if (this.isAutoTarget(effect2.target)) {
                  this.executeEffect(effect2, target, game);
                } else {
                  //skipping summon
                }
              });
              if (effect.type === 'equipDiscard') {
                // Remove from discard
                const idx = discard.indexOf(item);
                if (idx !== -1) discard.splice(idx, 1);
              }
            });
          }
          //console.log(`Master of Arms equipped ${toEquip.length} items from discard`);
          break;
        
        case 'allLastGasp': {
          if (!this.isCard(target)) {
            this.runEffects('LastGasp',target, game);
          }
          break;
        }

        case 'fieldToShadow': {
          game.laneTypes = game.laneTypes.map(lane =>
            lane === 'Field' ? 'Shadow' : lane
          );
          break;
        }

        case 'healDamageTaken':
          if (!this.isCard(target)) {
            const amountToHeal = game.lastDamageTaken;
            if (amountToHeal > 0) {
              target.health = Math.min(99,target.health + amountToHeal);
              if (outputLogs) console.log(`healed ${amountToHeal} from ${sourceCard.name} effect`);
              game.healthJustGained = amountToHeal;
              this.runEffects('HealPlayer',target, game);
            }
          }
          break;

        case 'heal':
          if (this.isCard(target)) {
            if (target.currentHealth === undefined || target.maxHealth === undefined) {
              if (outputLogs) console.warn('Heal effect on card without health properties');
              break;
            }
            if (target.currentHealth < target.maxHealth) {
              game.lastHealingTaken = target.maxHealth - target.currentHealth;
              target.currentHealth = target.maxHealth;
              if (outputLogs) console.log(`${target.name} was healed`);
              this.runEffects('HealCreature',target.isOpponent ? game.opponent : game.player, game);
            }
          }
          break;

        case 'banish':
          if (this.isCard(target)) {
            target.banished = true;
            if (outputLogs) console.log(`Banish: Removed ${target.name} from discard`);            
          }else {
            if (outputLogs) console.warn('Banish target is not a valid card');
          }
          break;
        
        case 'doubleAttack':
          if (this.isCard(target)) {
            target.currentAttack! *= 2;
            if (outputLogs) console.log(`${target.name} had attack doubled`);
          }
          break;

        case 'doubleHealth':
          if (this.isCard(target)) {
            target.maxHealth! *= 2;
            target.currentHealth! *= 2;
            if (outputLogs) console.log(`${target.name} had health doubled`);
          }
          break;

        case 'doubleStats':
          if (this.isCard(target)) {
            target.currentAttack! *= 2;
            target.maxHealth! *= 2;
            target.currentHealth! *= 2;
            if (outputLogs) console.log(`${target.name} had stats doubled`);
          }
          break;

        case 'destroyAllExcept':
          if (!this.isCard(target)) {
            const player = target as PlayerState;
            const survivingCreatures: Card[] = [];

            // Process each lane independently
            player.board.forEach((lane, laneIndex) => {
              if (lane.length === 0) return;

              let survivor: Card;
              if (lane.length === 1) {
                survivor = lane[0];
              } else {
                const idx = Math.floor(Math.random() * lane.length);
                survivor = lane[idx];
              }
              survivingCreatures.push(survivor);

              if (outputLogs) console.log(`Lane ${laneIndex} survivor: ${survivor.name}`);

              // Destroy all others
              lane.forEach(c => {
                if (c !== survivor) {                  
                  //console.log(`Lane ${laneIndex} casualty: ${c.name}`);
                  c.currentHealth = 0;
                }
              });
            });

            // Log history
            this.logHistory(game,{
              player: player === game.player ? 'You' : 'Opponent',
              actionType: 'summon-effect',
              description: `${player === game.player ? 'You' : 'Opponent'} destroyed all creatures except one per lane`,
              details: [
                `Survivors: ${survivingCreatures.map(c => c.name).join(', ') || 'none'}`
              ]
            });
          } else {
            if (outputLogs) console.warn('destroyAllExcept target is not a valid player');
          }
          break;

        case 'blink':{
          if (!this.isCard(target) || target.type !== 'Creature') {
            if (outputLogs) console.log('invalid target');
            break;
          }
          const ownerTarget = target.isOpponent ? game.opponent : game.player;
          ownerTarget.limbo.push(target);
          if (outputLogs) console.log(`blinking ${target.name}`);
          const lanePos = ownerTarget.board[target.laneIndex!].indexOf(target);
          this.reverseAurasOnTarget(game,target);
          ownerTarget.board[target.laneIndex!].splice(lanePos,1);
          break;
        }


        case 'stealKeywords':
        if (this.isCard(target) && this.isCard(sourceCard)) {
          if (target.currentKeywords?.length) {
            const stolen = target.currentKeywords.filter(k => this.keywordList.includes(k));
            const remaining = target.currentKeywords.filter(k => !this.keywordList.includes(k));
            target.currentKeywords = remaining;
            this.addUniqueKeywords(sourceCard, game, stolen);
            if (outputLogs) console.log(`${sourceCard.name} stole keywords from ${target.name}: ${stolen.join(', ')}`);
            /*this.logHistory(game,{
              player: owner === game.player ? 'You' : 'Opponent',
              actionType: 'summon-effect',
              description: `${sourceCard.name} stole ${stolen.length} keywords from ${target.name}`
            });*/
          }
        }
        break;

        case 'stealItems':
          if (this.isCard(target) && this.isCard(sourceCard)) {
            if (target.attachedItems?.length) {
              const stolenItems = [...target.attachedItems];
              target.attachedItems = [];

              // Revert item buffs on target
              stolenItems.forEach(item => {
                target.currentAttack! -= (item.currentAttack ?? item.attack ?? 0);
                target.currentHealth! -= (item.currentHealth ?? item.health ?? 0);
                target.maxHealth! -= (item.currentHealth ?? item.health ?? 0);
                (item.keywords ?? []).forEach(w => {
                  target.currentKeywords = (target.currentKeywords ?? []).filter(k => k !== w);
                });
              });

              // Apply items to source (no summon effects)
              stolenItems.forEach(item => {
                sourceCard.currentAttack! += (item.currentAttack ?? item.attack ?? 0);
                sourceCard.currentHealth! += (item.currentHealth ?? item.health ?? 0);
                sourceCard.maxHealth! += (item.currentHealth ?? item.health ?? 0);
                this.addUniqueKeywords(sourceCard, game, item.keywords ?? []);
                sourceCard.attachedItems = sourceCard.attachedItems || [];
                sourceCard.attachedItems.push(item);
                game.lastCardEquipped = item;
                this.runEffects('EquipFriendly',owner,game);
              });

              if (outputLogs) console.log(`${sourceCard.name} stole ${stolenItems.length} items from ${target.name}`);
              /*this.logHistory(game,{
                player: owner === game.player ? 'You' : 'Opponent',
                actionType: 'summon-effect',
                description: `${sourceCard.name} stole ${stolenItems.length} items from ${target.name}`
              });*/
            }
          }
          break;

        case 'shareKeywords':
          if (this.isCard(target) && this.isCard(sourceCard)) {
            let sourceKeys = sourceCard
            if (sourceCard.type === 'Item') {
              sourceKeys = this.findWielderOfItem(game, sourceCard)!;
            }
            if (sourceKeys.currentKeywords?.length) {
              const shared = [...sourceKeys.currentKeywords];
              this.addUniqueKeywords(target, game,shared);
              if (outputLogs) console.log(`${sourceCard.name} shared keywords with ${target.name}: ${shared.join(', ')}`);
              /*this.logHistory(game,{
                player: owner === game.player ? 'You' : 'Opponent',
                actionType: 'summon-effect',
                description: `${sourceCard.name} shared keywords with ${target.name}`
              });*/
            }
          }
          break;

        case 'drawDiscard':
          if (this.isCard(target)) return;
          const gy = target.discard;
          if (gy.length === 0) {
            if (outputLogs) console.log('Discard empty');
            break;
          }
          let gyCandidates = [...gy];
          if (effect.subtypes?.length) {
            const isTypeFilter = effect.subtypes.every(s => ['Action','Item','Creature','Support'].includes(s));
            if (isTypeFilter) {
              gyCandidates = gyCandidates.filter(c => effect.subtypes!.includes(c.type));
            } else {
              gyCandidates = gyCandidates.filter(c => 
                c.subtypes?.some(s => effect.subtypes!.includes(s))
              );
            }
          }
          gyCandidates = gyCandidates.filter(c => c.id !== sourceCard.id);
          if (gyCandidates.length === 0) {
            if (outputLogs) console.log('No matching cards in discard');
            break;
          }
          const drawn = this.utilityService.random(gyCandidates);
          const idx2 = gy.indexOf(drawn);
          if (idx2 !== -1) gy.splice(idx2, 1);
          game.lastCardDrawn = drawn;
          if (target.hand.length < 10) {
            target.hand.push(drawn);
          } else {
            //this.showBurnHint(drawn, target === game.opponent);

            this.queuePendingAction(game, {
                type: 'burn',
                sourceCard: drawn,
                opponentTarget: target === game.opponent
            });
          }
          this.reapplyHandAuras(target);
          if (outputLogs) console.log(`Drew ${drawn.name} from discard`);
          break;

        case 'transform':
          if (outputLogs) console.log('trying transform');
          if (!this.isCard(target)) return;
          const ownerT = target.isOpponent ? game.opponent : game.player;
          if (effect.cardId && !effect.target?.includes('Hand') && effect.target !== 'drawnCard') {
            if (outputLogs) console.log('using cardid)');
            let newCardId = effect.cardId;
            if (effect.cardId === 'revealedCreature') newCardId = game.creatureRevealed!.id;        
            let newTemplate: Card | null;
            if (effect.cardId === 'legendary') {
              newTemplate = this.deckService.getRandomCreatureByCost(20,'max','4Legendary')!;
            } else {
              newTemplate = this.deckService.getCardById(newCardId)!;
            }
            if (!newTemplate) {
              if (outputLogs) console.log('didnt find card');
              return;
            }
            const newCopy = this.deckService.cloneCardForGame(newTemplate, target.isOpponent!);
            const newCreature = {
              ...newCopy,
              laneIndex: target.laneIndex,
              currentAttack: newCopy.attack ?? 0,
              currentHealth: newCopy.health ?? 0,
              maxHealth: newCopy.health ?? 0,
              // ... other init
            };
            // Remove old auras
            this.reverseAurasOnTarget(game,target);
            // Replace in lane
            const lane = ownerT.board[target.laneIndex!];
            const pos = lane.indexOf(target);
            if (pos !== -1) {
              lane[pos] = newCreature;
            }
            // Trigger new summon effects
            newCreature.effects?.forEach(e => {
              if (e.trigger === 'Summon') {
                if (this.isAutoTarget(e.target)) {
                  this.executeEffect(e, newCreature, game);
                } else {
                  const aiTarget = this.getSummonTarget(game, e, newCreature, newCreature.isOpponent!);
                  if (aiTarget) this.executeEffect(e, newCreature, game, aiTarget);
                }
              }
            });
            this.applyCardAuras(game, newCreature, ownerT);
            this.checkCreatureDeath(game);
            if (outputLogs) console.log(`${target.name} transformed into ${newCreature.name}`);
          } else if (effect.subtypes && effect.target === 'deck') {
            const newCardTemplate = this.deckService.getRandomCardBySubtypes(effect.subtypes);
            const newCopy = this.deckService.cloneCardForGame(newCardTemplate!,sourceCard.isOpponent!);
            owner.deck.shift();
            owner.deck.push(newCopy);
            //console.log(`added ${newCardTemplate.name} to deck`);
          } else if (effect.target === 'playerHand') {
            if (outputLogs) console.log(`trying to transform ${target.name}`);
            const newCardTemplate = this.deckService.getRandomCardByCost(20,'max');
            const newCopy = this.deckService.cloneCardForGame(newCardTemplate!,sourceCard.isOpponent!);
            owner.hand.shift();
            owner.hand.push(newCopy);
          } else if (effect.target === 'creaturePlayerHand' || effect.target === 'drawnCard') {
            if (effect.cardId) {
              let newCardId = effect.cardId;
              if (effect.cardId === 'revealedCreature') newCardId = game.creatureRevealed!.id;        
              let newTemplate: Card | null;
              if (effect.cardId === 'legendary') {
                newTemplate = this.deckService.getRandomCreatureByCost(20,'max','4Legendary')!;
              } else if (effect.cardId === 'maxMagicka') {
                newTemplate = this.deckService.getRandomCardByCost(owner.maxMagicka,'equal')!;
              } else {
                newTemplate = this.deckService.getCardById(newCardId)!;
              }
              const newCopy = this.deckService.cloneCardForGame(newTemplate, target.isOpponent!);
              const handIndex = owner.hand.indexOf(target);
              if (handIndex !== -1) {
                owner.hand.splice(handIndex,1);
                owner.hand.push(newCopy);
              }
              
            }
          }
          break;

        case 'steal':
          if (!this.isCard(target) || target.type !== 'Creature') return;
          const stealOwner = target.isOpponent ? game.player : game.opponent;
          const stealLane = target.laneIndex!;
          if (stealOwner.board[stealLane].length >= 4) {
            if (outputLogs) console.log('Steal failed: lane full');
            break;
          }
          // Remove from original owner
          const origOwner = target.isOpponent ? game.opponent : game.player;
          const origLane = origOwner.board[target.laneIndex!];
          const pos = origLane.indexOf(target);
          if (pos !== -1) origLane.splice(pos, 1);
          // Revert auras from original owner
          this.reverseAurasOnTarget(game,target);
          // Change ownership
          target.isOpponent = !target.isOpponent;
          // Add to new owner
          stealOwner.board[stealLane].push(target);
          // Apply new owner's auras
          this.applyCardAuras(game, target, stealOwner);
          if (outputLogs) console.log(`${sourceCard.name} stole ${target.name}`);
          break;

        case 'shuffleProphecy':
          if (this.isCard(target)) return;
          const p = target as PlayerState;
          // 1. Separate Prophecy cards from non-Prophecy
          const prophecyCards = p.hand.filter(card => card.prophecy === true);
          const nonProphecyCards = p.hand.filter(card => card.prophecy !== true);

          const prophecyCount = prophecyCards.length;
          if (prophecyCount === 0) {
            if (outputLogs) console.log('No Prophecy cards in hand — shuffleProphecy does nothing');
            break;
          }

          // 2. Shuffle only Prophecy cards back into deck
          p.deck.push(...prophecyCards);
          p.deck = this.utilityService.shuffle(p.deck);

          // 3. Hand now contains only non-Prophecy cards
          p.hand = nonProphecyCards;
          //this.handVersion++;

          // 4. Redraw the same number of Prophecy cards that were shuffled back
          this.drawCards(p, prophecyCount, game);

          if (outputLogs) console.log(`Shuffled ${prophecyCount} Prophecy card(s) into deck and redrew`);
          break;

        case 'moveToBottom':
          if (this.isCard(target)) return;
          const deckOwner = target;
          if (deckOwner.deck.length === 0) break;
          const topCard = deckOwner.deck.shift()!;
          deckOwner.deck.push(topCard);
          if (outputLogs) console.log(`Moved top card ${topCard.name} to bottom of deck`);
          break;

        default:
          console.warn(`Unimplemented effect type: ${effect.type}`);
      }
    });

    // ── 3. Cleanup ──────────────────────────────────────────────────────────
    const deathsBefore = this.currentDeathTotalThisTurn;
    this.checkCreatureDeath(game);
    const deathsAfter = this.currentDeathTotalThisTurn;
    if (deathsAfter !== deathsBefore) {
      this.checkCreatureDeath(game);
    }

    if (game.stagedSummon === sourceCard) {
      this.clearSummonTargeting(game);
    }
  }

  private applyCardUpgrades(player: PlayerState, card: Card) {
    // Follow the upgrade chain until no more upgrades
    let currentId = card.id;
    while (player.cardUpgrades[currentId]) {
      currentId = player.cardUpgrades[currentId];
    }
    if (currentId !== card.id) {
      const upgradedTemplate = this.deckService.getCardById(currentId);
      if (upgradedTemplate) {
        // Preserve runtime state (cost mods, etc.)
        const preservedCost = card.currentCost ?? card.cost;

        Object.assign(card, this.deckService.cloneCardForGame(upgradedTemplate, card.isOpponent!));
        card.currentCost = preservedCost;
        card.id = currentId;

        console.log(`Applied upgrade: ${card.name}`);
      }
    }
  }
  
  /*Returns true if this target type affects multiple cards automatically*/
  private isMassSummonEffect(targetType?: TargetType): boolean {
    const massTypes: TargetType[] = [
      'creatureAll',
      'creatureOtherAll',
      'creatureEnemyAll',
      'creatureEnemyThisLaneAll',
      'creatureFriendlyAll',
      'creatureFriendlyOtherAll',
      'creatureFriendlyOtherThisLaneAll',
      'creatureFriendlyThisLaneAll',
      'creatureOtherThisLaneAll',
      'creatureThisLaneAll',
      'creatureDiscardAll',
      'supportFriendlyAll',
      'enemyAll',
      'players',
      'playerHand',
      'allHands',
      'opponentHand',
      'deck'
      // add more as needed: 'allCreaturesInLane', etc.
    ];
    return targetType ? massTypes.includes(targetType) : false;
  }

  private reverseAurasOnTarget(game: GameState, target: Card) {
    const aurasToRemove: AuraEffect[] = [];
    const ownerTarget = target.isOpponent ? game.opponent: game.player;
    ownerTarget.auras = ownerTarget.auras?.filter(a => {
      if (a.sourceInstanceId === target.instanceId) {
        aurasToRemove.push(a);
        return false;
      }
      return true;
    }) || [];

    aurasToRemove.forEach(aura => {
      if (aura.isHandAura && aura.type === 'modCost') {
        const amount = aura.amount ?? -1;  // reverse the reduction
        ownerTarget.hand.forEach(handCard => {
          if (aura.appliedTo?.has(handCard.instanceId!)) {
            handCard.currentCost = (handCard.currentCost ?? handCard.cost ?? 0) - amount;
            console.log(`Reverted hand cost aura on ${handCard.name}`);
          }
        });
        if (aura.affectsOpponentHand) {
          const otherPlayer = ownerTarget === game.player ? game.opponent : game.player;
          otherPlayer.hand.forEach(handCard => {
            if (aura.appliedTo?.has(handCard.instanceId!)) {
              handCard.currentCost = (handCard.currentCost ?? handCard.cost ?? 0) - amount;
              console.log(`Reverted hand cost aura on ${handCard.name}`);
            }
          });
        }
      } else if (aura.isPlayerAura && aura.type === 'maxMagicka') {
        const amount = aura.amount ?? 1;
        ownerTarget.maxMagicka = Math.max(0, ownerTarget.maxMagicka - amount);
        ownerTarget.currentMagicka = Math.min(ownerTarget.currentMagicka, ownerTarget.maxMagicka);
      } else {
        if (aura.appliedTo?.size > 0) this.reverseAuraEffects(game,aura);
      }
    });
  }

  /*Get ALL targets that match a mass summon effect*/
  private getMassSummonTargets(game: GameState, effect: CardEffect, source: Card, targetLane?: number): (Card | PlayerState)[] {
    const targetType = effect.target;
    const owner = source.isOpponent ? game.opponent : game.player;
    const enemy = source.isOpponent ? game.player : game.opponent;
    let sourceLane = source.laneIndex ?? -1;
    if (targetLane !== undefined) {
      sourceLane = targetLane;
    }
    console.log('mass summon lane: ', sourceLane);
    let baseTargets: (Card | PlayerState)[] = [];
    switch (targetType) {
      case 'deck':
        baseTargets = [...owner.deck];
        break;
      case 'playerHand':
        baseTargets = [...owner.hand];
        break;
      case 'opponentHand':
        baseTargets = [...enemy.hand];
        break;
      case 'allHands':
        baseTargets = [...owner.hand, ...enemy.hand];
        break;
      case 'creatureAll':
        baseTargets = [...game.player.board[0], ...game.player.board[1], ...game.opponent.board[0], ...game.opponent.board[1]];
        break;
      case 'creatureEnemyAll':
        baseTargets =  [...enemy.board[0], ...enemy.board[1]];
        break;
      case 'creatureEnemyThisLaneAll':
        if (sourceLane < 0) {
          baseTargets =  [];
        } else { 
          baseTargets =  [...enemy.board[sourceLane]];
        }
        break;
      case 'supportFriendlyAll':
        baseTargets = [...owner.support];
        break;
      case 'creatureDiscardAll':
        baseTargets = [...owner.discard.filter(c => c.type === 'Creature')];
        break;
      case 'creatureFriendlyAll':
        baseTargets =  [...owner.board[0], ...owner.board[1]];
        break;
      case 'creatureFriendlyOtherAll':
        baseTargets =  [...owner.board[0], ...owner.board[1]].filter(c => c.instanceId !== source.instanceId);
        break;
      case 'creatureFriendlyThisLaneAll':
        if (sourceLane < 0) {
          baseTargets =  [];
        } else {
          baseTargets =  [...owner.board[sourceLane]];
        }
        break;
      case 'creatureFriendlyOtherThisLaneAll':
        if (sourceLane < 0) {
          baseTargets =  [];
        } else {
          baseTargets =  [...owner.board[sourceLane].filter(c => c.instanceId !== source.instanceId)];
        }
        break;
      case 'creatureOtherAll':
        if (sourceLane < 0) {
          baseTargets =  [];
        } else {
          const friendlyInLane =  owner.board[sourceLane].filter(c => c.instanceId !== source.instanceId);
          return [...friendlyInLane, ...enemy.board[sourceLane], ...owner.board[1-sourceLane], ...enemy.board[1-sourceLane]];
        }
        break;
      case 'creatureOtherThisLaneAll':
        if (sourceLane < 0) {
          baseTargets =  [];
        } else {
          const friendlyInLane =  owner.board[sourceLane].filter(c => c.instanceId !== source.instanceId);
          return [...friendlyInLane, ...enemy.board[sourceLane]];
        }
        break;
      case 'creatureThisLaneAll':
        if (sourceLane < 0) {
          baseTargets =  [];
        } else {
          baseTargets =  [...owner.board[sourceLane], ...enemy.board[sourceLane]];
        }
        break;
      case 'enemyAll':
        baseTargets =  [enemy, ...enemy.board[0], ...enemy.board[1]];
        break;
      case 'players':
        baseTargets =  [game.player, game.opponent];
        break;
      default:
        console.warn(`Unhandled mass summon target: ${targetType}`);
        baseTargets =  [];
    }
    //filter for targetCondition
    if (effect.targetCondition) {
      baseTargets = baseTargets.filter(t => 
        this.isCard(t) && this.deckService.isTargetConditionMet(t, effect.targetCondition, undefined)
      );
    }
    return baseTargets;
  }

  // Check if a card/player is valid for the staged summon effect
    

  private hasActivationLimitImmunity(player: PlayerState): boolean {
      const board0Bool = player.board[0].some(creature =>
        creature.immunity?.includes('ActivationLimit')
      );
      const board1Bool = player.board[1].some(creature =>
        creature.immunity?.includes('ActivationLimit')
      );
      return (board0Bool || board1Bool);
    }
  
    addUniqueKeywords(target: Card, game: GameState, keywords?: string[]) {
      target.currentKeywords = Array.from(
        new Set([
          ...(target.currentKeywords ?? []),
          ...(keywords ?? [])
        ])
      );
      const beforeCovered = target.covered;
      if (target.currentKeywords.includes('Cover')) target.covered = true;
      if (target.currentKeywords.includes('Stealth')) target.covered = true;
      if (target.immunity?.includes('Cover')) {
        target.currentKeywords.filter(k => k !== 'Cover');
        target.currentKeywords.filter(k => k !== 'Stealth');
        target.covered = false;
      } 
      if (target.currentKeywords.includes('Guard')) target.covered = false;
      if (target.currentKeywords.includes('Charge')) target.sick = false;
      const afterCovered = target.covered;
      if (!beforeCovered && afterCovered) {
        target.effects?.forEach(effect => {
          if (effect.trigger !== 'GainCover') return;
          // Auto-target effects → resolve immediately
          if (this.isAutoTarget(effect.target)) {
            console.log('GainCover triggered for: ', target.name)
            this.executeEffect(effect, target, game);
          } else {
            console.log('no auto target for covered target: ', effect.target)
          }
        });
      }
    }  
  
    opponentPlayCard(game: GameState, card: Card, laneIndex?: number, target?: Card | PlayerState, freePlay: boolean = false) {
      if (!freePlay) {
        if (game.opponent.currentMagicka < (card.currentCost ?? card.cost)) return;
        const handIndex = game.opponent.hand.indexOf(card);
        if (handIndex === -1) return;
        game.opponent.hand.splice(handIndex, 1);
        if ((card.currentCost ?? card.cost) > 0) game.opponent.currentMagicka -= (card.currentCost ?? card.cost);
      } else {
        console.log(`Free Prophecy play: ${card.name} (no cost)`);
      }
      if (game.tempCostAdjustment !== 0) {
        game.opponent.hand.forEach(cardInHand => {
          cardInHand.currentCost = (cardInHand.currentCost ?? cardInHand.cost ?? 0) - game.tempCostAdjustment;
        });
        game.tempCostAdjustment = 0;
      }
      if (!card.effects?.some(e => e.type === 'modCost' && e.target === 'self')) card.currentCost = card.cost;
      game.lastCardPlayed = card;
  
      // In playCard or opponentPlayCard
      this.logHistory(game,{
        player: card.isOpponent ? 'Opponent' : 'You',
        actionType: 'play-card',
        description: `${card.isOpponent ? 'Opponent' : 'You'} played ${card.name}`,
        details: card.type === 'Creature' ? [`To lane ${game.laneTypes[laneIndex!]}`] : []
      });
      const refType = this.deckService.getEffectiveType(card);
  
      switch (refType) {
        case 'Creature': {
          const hasCharge = card.keywords?.includes('Charge') ?? false;
          const hasGuard  = card.keywords?.includes('Guard') ?? false;
          const creature: Card = {
            ...card,
            laneIndex: laneIndex,
            attachedItems: [],
            sick: hasCharge ? false: true, //charge gets 1 attack immediately
            attacks: 1, 
            covered: game.laneTypes[laneIndex!] === 'Shadow' && !hasGuard &&
                !card.immunity?.includes('Cover')  // true in shadow lane unless Guard
          };
          const spendAll = card.effects?.some(e => 
            e.trigger === 'Play' && e.type === 'spendAllForStats'
          );
          if (spendAll) {
            const manaSpent = game.opponent.currentMagicka;
            game.opponent.currentMagicka = 0;
            creature.currentAttack! += manaSpent;
            creature.currentHealth! += manaSpent;
            creature.maxHealth! += manaSpent;
          }
          game.opponent.board[laneIndex!].push(creature);
          game.lastCardSummoned2 = game.lastCardSummoned;
          game.lastCardSummoned = creature;
          if (creature.covered) {
            creature.effects?.forEach(effect => {
              if (effect.trigger !== 'GainCover') return;
              // Auto-target effects → resolve immediately
              if (this.isAutoTarget(effect.target)) {
                console.log('GainCover triggered for: ', creature.name)
                this.executeEffect(effect, creature, game);
              } else {
                console.log('no auto target for covered target: ', effect.target)
              }
            });
          }
          if (game.laneTypes[laneIndex!] === 'Plunder') {
            const itemEffect: CardEffect = {
              "trigger": "Summon",
              "type": "equipRandom",
              "addKeywords": [],
              "removeKeywords": [],
              "target": "self"
            }
            this.executeEffect(itemEffect,creature,game,creature);
          }
          if (game.opponent.numSummon == 0) {
            this.runEffects('SummonFirst',game.opponent, game);
          }
          game.opponent.numSummon++;
          this.runEffects('SummonCreature',game.opponent, game);
          this.runEffects('SummonCreatureEnemy',game.player, game);
          this.applyCardAuras(game, creature, game.opponent);
  
          let creatureTarget: Card | PlayerState;
          creature.effects?.forEach(effect => {
            if (effect.trigger !== 'Summon') return;
  
            if (this.isAutoTarget(effect.target)) {
              this.executeEffect(effect, creature, game);
            } else {
              // Manual target → AI chooses intelligently
              creatureTarget = creatureTarget ?? target ?? this.getSummonTarget(game, effect, creature, true);
              //const aiTarget = target ?? this.getSummonTarget(game, effect, creature, true);
              if (creatureTarget) {
                this.executeEffect(effect, creature, game, creatureTarget);
                console.log(`Opponent chose summon target: ${(creatureTarget as any).name || 'face'}`);
              } else {
                console.log(`No valid summon target for opponent: ${creature.name}`);
              }
            }
          });
          break;
        }
  
        case 'Item': {
          if (!target) return;
          if (!this.isCard(target)) return;
  
          target.currentAttack! += card.currentAttack ?? card.attack ?? 0;
          target.currentHealth! += card.currentHealth ?? card.health ?? 0;
          target.maxHealth! += card.currentHealth ?? card.health ?? 0;
  
          this.addUniqueKeywords(target,game, card.currentKeywords ?? card.keywords ?? []);
          const tempKeywordsToAdd = card.tempKeywords ?? [];
          this.addUniqueKeywords(target,game, tempKeywordsToAdd);
          if (card.immunity) {
            target.immunity = Array.from(
              new Set([
                ...(target.immunity ?? []),
                ...(card.immunity ?? [])
              ])
            );
          }
          if (card.tempKeywords) {
            target.tempKeywords = Array.from(
              new Set([
                ...(target.tempKeywords ?? []),
                ...(tempKeywordsToAdd)
              ])
            );
          }
  
          target.attachedItems!.push({ ...card });
          game.lastCardEquipped = card;
          this.runEffects('EquipFriendly',game.opponent,game);
  
          target.effects?.forEach(effect => {
                if (effect.trigger !== 'EquipItem') return;
                // Auto-target effects → resolve immediately
                if (this.isAutoTarget(effect.target)) {
                  console.log('Equip Item triggered for: ', target.name)
                  this.executeEffect(effect, target, game);
                } else {
                  console.log('no auto target for equip item target: ', effect.target)
                }
              });
  
          card.effects?.forEach(effect => {
            if (effect.trigger !== 'Summon') return;
            
            if (this.isAutoTarget(effect.target)) {
              this.executeEffect(effect, card, game);
            } else {
              const aiTarget = this.getSummonTarget(game, effect, card, true);
              if (aiTarget) {
                this.executeEffect(effect, card, game, aiTarget);
                console.log(`Opponent chose summon target: ${(aiTarget as any).name || 'face'}`);
              } else {
                console.log(`No valid summon target for opponent: ${card.name}`);
              }
            }
          });
          break;
        }
  
        case 'Support': {
          game.opponent.support.push({ ...card });
          this.applyCardAuras(game, card, game.opponent);
          card.effects?.forEach(effect => {
              if (effect.trigger !== 'Summon') return;
    
              if (this.isAutoTarget(effect.target)) {
                this.executeEffect(effect, card, game);
              } else {
                // Manual target → AI chooses intelligently
                const aiTarget = this.getSummonTarget(game, effect, card, card.isOpponent!);
                if (aiTarget) {
                  this.executeEffect(effect, card, game, aiTarget);
                  console.log(`Automatically chose summon target: ${(aiTarget as any).name || 'face'}`);
                } else {
                  console.log(`No valid summon target for: ${card.name}`);
                }
              }
            });
          break;
        }
  
        case 'Action': {
          const originalCard = this.deckService.getCardById(card.id);
          const freshCopy = this.deckService.cloneCardForGame(originalCard!, true);
          game.opponent.discard.push(freshCopy);
          // Resolve Play effects
          card.effects?.forEach(effect => {
            if (effect.trigger !== 'Play') return;
            console.log(`${card.name}: ${effect.type}, lane: ${laneIndex}`);
            // Auto effects
            if (this.isAutoTarget(effect.target)) {
              this.executeEffect(effect, card, game, undefined, laneIndex);
            } else if (target !== undefined) {
              this.executeEffect(effect, card, game, target, laneIndex);
            } else {
              // Manual target (find one using AI logic)
              const aiTarget = target ?? this.getActionTarget(game, card, effect, true);
              if (aiTarget) {
                this.executeEffect(effect, card, game, aiTarget, laneIndex);
              } else if (laneIndex !== undefined) {
                this.executeEffect(effect, card, game, undefined, laneIndex);
              } else {
                console.log(`No valid target for opponent Action effect: ${effect.type}`);
              }
            }
          });
          if (card.effects?.some(e => e.trigger === 'EndOfTurn')) {
            console.log(`pushing ${card.name} to limbo.`);
            game.opponent.limbo.push(card);
          }
          this.logOpponent(`Played action "${card.name}"`);
          game.opponent.actionsPlayed++;
          break;
        }
      }
      game.opponent.cardsPlayed++;
      const cardId = card.id;
      game.opponent.playCounts[cardId] = (game.opponent.playCounts[cardId] || 0) + 1;
      //console.log(`Opponent' played ${card.name} (${cardId}) — now played ${game.opponent.playCounts[cardId]} times`);
      this.runEffects('PlayCard',game.opponent, game);
      this.updateStaticBuffs(game,game.opponent);
      this.updateStaticBuffs(game,game.player);
    }

    private checkHandEffects(game: GameState, player: PlayerState) {
      player.hand.forEach(card => {
        card.effects?.forEach(effect => {
          if (effect.type === 'modCostDiscard') {
            const scalar = this.getAmountPer(game, 'numSubtypeDiscard',card);
            const modCost = (effect.modCost ?? 0)*scalar;
            card.currentCost = card.cost + modCost;
          }
        });
      });
    }
  
    private getSummonTarget(game: GameState, effect: CardEffect, source: Card, isOpponent: boolean): Card | PlayerState | undefined {
  
      const effectType = effect.type;
      // Default: use getValidTargets logic
      const candidates = this.getValidTargets(game,effect.target as TargetType, source, source.laneIndex ?? 0);
      const valid = candidates.filter(t => 
        this.isTargetValidForEffect(game, source, effect, t, source.laneIndex ?? 0)
      );
      console.log(`Opponent summon target search for effect type "${effectType}": ${valid.length} valid targets found`);
      // Filter based on effect type
      let filteredTargets: (Card | PlayerState)[] = [];
      if (effectType === 'buffTarget' || effectType === 'doubleStats' || effectType === 'doubleAttack' || effectType === 'doubleHealth') {
        if ((effect.modAttack ?? 0) < 0 || (effect.modHealth ?? 0) < 0 ||
          (effect.tempAttack ?? 0) < 0 || (effect.removeKeywords ?? []).length > 0) {
          // Only enemy targets
          filteredTargets = valid.filter(target => {
            return this.isCard(target) && 
                  target.isOpponent !== isOpponent && 
                  target.type === 'Creature';
          });
        } else {
          // Only friendly targets
          filteredTargets = valid.filter(target => {
            return this.isCard(target) && 
                  (target.instanceId !== source.instanceId || game.classicTargeting) &&
                  target.isOpponent === isOpponent && 
                  target.type === 'Creature';
          });
        }
      } 
      else if (effectType === 'destroy' || effectType === 'damage' || 
          effectType === 'silence' || effectType === 'unsummon' || effectType === 'shackle') {
        // Only enemy targets (player's creatures or face)
        filteredTargets = valid.filter(target => {
          // Include enemy's creatures
          if (this.isCard(target) && target.isOpponent !== isOpponent) {
            if (effect.target === 'supportEnemy') {
              return target.type === 'Support';
            } else if (effect.target === 'creatureSupportEnemy') {
              return target.type === 'Creature' || target.type === 'Support';
            } else {
              return target.type === 'Creature';
            }
          }
          // Or the enemy face
          return target === game.player;
        });
        if (filteredTargets.length === 0 && source.type === 'Creature' && source.targetReq) {
          filteredTargets = [source];
        }
      } 
      else {
        // Fallback: use normal validation
        filteredTargets = valid.filter(target =>
          this.isTargetValidForEffect(game,source, effect, target, 0)
        );
      }
      console.log(`After filtering for effect type "${effectType}", ${filteredTargets.length} valid targets remain`);
      return filteredTargets.length > 0 ? 
        this.pickBestTarget(filteredTargets,game,source,effect) : 
        undefined;
      //return filteredTargets.length > 0 ? this.utilityService.random(filteredTargets) : undefined;
  
      //return valid.length > 0 ? this.random(valid) : undefined;
    }
  
    opponentAttackPhase(game: GameState) {
      const attackers = this.getOpponentCreatures(game).filter(c =>
        (c.attacks ?? 0) > 0 &&
        !c.shackled &&
        !c.sick && 
        c.currentAttack! > 0 && 
        c.currentHealth! > 0
      );
  
      attackers.forEach(attacker => {
        if (attacker.currentHealth! > 0 && !attacker.shackled && attacker.currentAttack! > 0) {
          if (game.waitingOnAnimation) return;
          if (attacker.attackCondition && 
            !this.isAttackConditionMet(attacker.attackCondition,attacker.laneIndex,
              game.opponent)) {
            return false;
          }
          if (!game.gameRunning) return;
          if (game.stagedProphecy !== null) return;
          const targets = this.getOpponentValidAttackTargets(game,attacker);
          if (targets.length === 0) return;
    
          //const target = this.utilityService.random(targets);
          const target = this.pickBestAttackTarget(attacker, targets, game);
          this.logOpponent(
            `"${attacker.name}" is attacking ${!this.isCard(target) ? 'player' : `"${target.name}"`}`
          );
          game.stagedAttack = attacker;
          if (game.useAnimation) {
            game.waitingOnAnimation = true;
            this.queuePendingAction(game, {
                type: 'attackAnim',
                sourceCard: attacker,
                target: target
            });
          } else {
            this.resolveOpponentAttack(game, attacker, target);
            game.stagedAttack = null;
          }
        }
      });
    }

    opponentAttackPhase2(game: GameState) {
      let attacksPerformed = 0;
      const maxAttacks = 12; // safety limit
      let bestAction: AttackAction | null = null;
      while (attacksPerformed < maxAttacks && game.gameRunning && !game.waitingOnAnimation && game.stagedProphecy === null) {
        bestAction = this.findBestAttackSequence(game, 0);
        if (!bestAction) bestAction = this.findBestAttackSequence(game, 1);
        if (!bestAction) break;

        this.logOpponent(
          `"${bestAction.attacker.name}" is attacking ${this.isCard(bestAction.target) 
            ? `"${(bestAction.target as Card).name}"` 
            : 'the player face'}`
        );
        const attacker = this.findCardByInstanceId(game, bestAction.attacker.instanceId!)!;
        let defender: Card | PlayerState;
        if (this.isCard(bestAction.target)) {
          defender = this.findCardByInstanceId(game, bestAction.target.instanceId!)!;
        } else {
          defender = game.player;
        }
        game.stagedAttack = attacker;
        if (game.useAnimation) {
          game.waitingOnAnimation = true;
          this.queuePendingAction(game, {
            type: 'attackAnim',
            sourceCard: attacker,
            target: defender
          });
          return;
        } else {
          this.resolveOpponentAttack(game, attacker, defender);
          game.stagedAttack = null;
          attacksPerformed++;
        }
      }
    }
  
    private opponentActivateSupports(game: GameState, ring: boolean) {
      // Find all activatable supports
      const activatable = game.opponent.support.filter(support =>
        (support.attacks ?? 0) > 0 && (support.uses ?? 0) > 0 && 
        ((support.id !== 'ring-of-magicka' && !ring) ||
        (support.id === 'ring-of-magicka' && ring))
      );
  
      if (activatable.length === 0) return;
  
      // For simplicity, try to activate each one once per phase
      activatable.forEach(support => {
        if (!game.gameRunning) return;
  
        // Optional: add some AI logic to decide whether to activate
        // For now: always activate if possible
        this.opponentPlaySupportActivation(game, support);
        if (game.stagedProphecy !== null) return;
      });
    }
  
  private opponentPlaySupportActivation(game: GameState, support: Card) {
      // Find if any activation effect needs manual targeting

      support.activations = (support.activations ?? 0) + 1;
      const activationEffects = support.effects?.filter(e => e.trigger === 'Activation') || [];
      let manualTargetNeeded = false;

      for (const effect of activationEffects) {
          if (!this.isAutoTarget(effect.target)) {
          manualTargetNeeded = true;
          break;
          }
      }

      let target: Card | PlayerState | undefined = undefined;

      if (manualTargetNeeded) {
          // AI chooses target
          target = this.getActivationTarget(game, support, true);
      }

      // Execute all activation effects (with or without target)
      support.effects?.forEach(effect => {
          if (effect.trigger === 'Activation') {
          this.executeEffect(effect, support, game, target);
          }
      });

      // Decrease activation counters
      support.attacks = Math.max(0, (support.attacks ?? 1) - 1);
      if (support.uses !== undefined) {
          const owner = support.isOpponent ? game.opponent : game.player;
          if (!this.hasActivationLimitImmunity(owner)) {
          support.uses = Math.max(0, support.uses - 1);
          }
      }

      // Log
      this.logHistory(game, {
          player: 'Opponent',
          actionType: 'support-activation',
          description: `Opponent activated support ${support.name}${target ? ' on ' + (this.isCard(target) ? target.name : 'face') : ''}`,
          details: []
      });

      this.logOpponent(`Activated support "${support.name}"${target ? ' targeting ' + (this.isCard(target) ? target.name : 'face') : ''}`);
  }
  
  getOpponentValidAttackTargets(game: GameState, attacker: Card): (Card | PlayerState)[] {
    if (attacker.laneIndex === undefined) return [];        

    const lane = attacker.laneIndex; 
    const playerOtherLane = game.opponent.board[1 - lane];
    const enemyLane = game.player.board[lane];
    const enemyOtherLane = game.player.board[1 - lane];

    const attackAll = attacker.immunity?.includes('AttackRestrictions');
    if (attackAll) {
      return [...enemyLane.filter(c => !c.covered), ...enemyOtherLane.filter(c => !c.covered), game.player];
    }

    const laneHasGuard = enemyLane.some(c =>
      c.currentKeywords?.includes('Guard')
    );
    const otherLaneHasGuard = enemyOtherLane.some(c =>
      c.currentKeywords?.includes('Guard')
    );
    const laneHasSuperGuard = enemyLane.some(c =>
      c.immunity?.includes('DefenseRestrictions') && c.currentKeywords?.includes('Guard')
    );
    const otherLaneHasSuperGuard = enemyOtherLane.some(c =>
      c.immunity?.includes('DefenseRestrictions') && c.currentKeywords?.includes('Guard')
    );

    const targets: (Card | PlayerState)[] = [];

    enemyLane.forEach(c => {
      if (c.covered) return;
      if ((laneHasGuard || otherLaneHasSuperGuard) && !c.currentKeywords?.includes('Guard')) return;
      targets.push(c);
    });
    // 'LaneRestrictions' can move to attack other lane
    const canMoveToAttack = attacker.immunity?.includes('LaneRestrictions') && playerOtherLane.length < 4;
    if (canMoveToAttack) {
      enemyOtherLane.forEach(c => {
        if (c.covered) return;
        if ((otherLaneHasGuard || laneHasSuperGuard) && !c.currentKeywords?.includes('Guard')) return;
        targets.push(c);
      });
    } else if (otherLaneHasSuperGuard) {
      enemyOtherLane.forEach(c => {
        if (!c.immunity?.includes('DefenseRestictions')) return;
        targets.push(c);
      });
    }

    if (!laneHasGuard && !otherLaneHasSuperGuard) {
      targets.push(game.player);
    }

    return targets;
  }
  
  resolveOpponentAttack(game: GameState, attacker: Card, target: Card | PlayerState) {
      this.resolveAttack(game, attacker, target);
      this.logOpponent(
        `"${attacker.name}" attacked ${this.isCard(target) ? `"${target.name}"` : 'player'}`
      );
  }

  getOpponentCreatures(game: GameState): Card[] {
      return [...game.opponent.board[0], ...game.opponent.board[1]];
  }

  // Get valid creature targets (friendly creatures for items)
  getValidCreatureTargets(game: GameState): Card[] {
      if (game.stagedAction !== 'play-item') return [];
      
      const allCreatures: Card[] = [];
      if (this.isOpponentTurn(game)) {
      game.opponent.board.forEach(lane => {
          lane.forEach(creature => {
          if (creature.type === 'Creature') allCreatures.push(creature);
          });
      });
      } else {
      game.player.board.forEach(lane => {
          lane.forEach(creature => {
          if (creature.type === 'Creature') allCreatures.push(creature);
          });
      });
      }
      return allCreatures;
  }

  isLaneFull(game: GameState, laneIndex: number): boolean {
      if (this.isOpponentTurn(game)) {
        return game.opponent.board[laneIndex].length >= 4;
      } else {
        return game.player.board[laneIndex].length >= 4;
      }
      
  }

  
  
  isCard(target: Card | PlayerState): target is Card {
      if (target === null || target === undefined) {
        return false;
      }
      return 'type' in target && target.type !== undefined;
  }
  
resolveAttack(game: GameState, attacker: Card, target: Card | PlayerState, isBattle: boolean = false) {
  if (!attacker || (attacker.attacks ?? 0) <= 0 || attacker.currentAttack! <= 0) return;
  const outputLogs = game.simulating ? false : true;
  const attackerKeywords = attacker.currentKeywords || [];
  const isPilfer = attackerKeywords.includes('Pilfer');
  const isDrain = attackerKeywords.includes('Drain');
  const isBreakthrough = attackerKeywords.includes('Breakthrough');
  const isWard = attackerKeywords.includes('Ward');
  const isLethal = attackerKeywords.includes('Lethal');
  const isRally = attackerKeywords.includes('Rally');
  const isImmuneToDragons = attacker.immunity?.includes('Dragons');
  const isImmuneToLethal = attacker.immunity?.includes('Lethal');
  const isDragon = attacker.subtypes.includes('Dragon');

  
  const owner = attacker.isOpponent ? game.opponent : game.player;

  // 0. Rally
  if (isRally) {
    const handCreatures = owner.hand.filter(c => c.type === 'Creature');
    if (handCreatures.length === 0) {
      if (outputLogs) console.log(`${attacker.name} Rally: no creatures in hand`);
      return;
    }
    const randomCreatureInHand = this.utilityService.random(handCreatures);
    // Apply +1/+1
    randomCreatureInHand.currentAttack = (randomCreatureInHand.currentAttack ?? randomCreatureInHand.attack ?? 0) + 1;
    randomCreatureInHand.currentHealth = (randomCreatureInHand.currentHealth ?? randomCreatureInHand.health ?? 0) + 1;
    if (outputLogs) console.log(
      `${attacker.name} Rally → gave +1/+1 to random hand creature: ${randomCreatureInHand.name}`
    );
  }

  if (!isBattle) {
    if (attacker.covered) {
      attacker.covered = false;
      attacker.currentKeywords = attacker.currentKeywords?.filter(k => k !== 'Cover');
      attacker.currentKeywords = attacker.currentKeywords?.filter(k => k !== 'Stealth');
      if (outputLogs) console.log(`${attacker.name} lost Cover status`);
    }

    // ── 1. Trigger "When attacks" effects from the attacker ──────────────────
    this.runEffects('FriendlyAttack',owner,game);
    attacker.effects?.forEach(effect => {
      if (effect.trigger !== 'Attack') return;
      this.executeEffect(effect, attacker, game, target);
    });
    //also check for effects on attached items
    attacker.attachedItems?.forEach(item => {
      item.effects?.forEach(effect => {
        if (effect.trigger !== 'Attack') return;
        this.executeEffect(effect, attacker, game, target);
      });
    });
  }
  let damageDealt = attacker.currentAttack ?? 0;
  let damageTaken = 0;
  // ────────────────────────────────────────────────────────────────
  // 2. Apply damage
  // ────────────────────────────────────────────────────────────────
  game.lastCardReceivingDamage = null;
  if (this.isCard(target)) {
    const defenderKeywords = target.currentKeywords || [];
    const hasWard = defenderKeywords.includes('Ward');
    const hasLethal = defenderKeywords.includes('Lethal');
    const defenderImmuneDragon = target.immunity?.includes('Dragons');
    const defenderImmuneLethal = target.immunity?.includes('Lethal');
    const defenderIsDragon = target.subtypes?.includes('Dragon');
    // Creature vs Creature
    if (hasWard) {
      // Ward breaks — no damage goes through this time
      target.currentKeywords = target.currentKeywords?.filter(k => k !== 'Ward');
      damageDealt = 0; // no damage this attack
      if (outputLogs) console.log(`${target.name} Ward blocked all damage`);
      target.effects?.forEach(effect => {
      if (effect.trigger !== 'WardBroken') return;
        this.executeEffect(effect, target, game);
      });
    } else if (isDragon && defenderImmuneDragon) {
      damageDealt = 0;
      if (outputLogs) console.log('target immune to dragons');
    } else {
      const oldTargetHealth = target.currentHealth ?? 0;
      target.currentHealth = Math.max(0, oldTargetHealth - damageDealt);
      // Breakthrough: excess damage goes to face
      if (isBreakthrough && target.currentHealth === 0) {
        const excess = damageDealt - oldTargetHealth;
        if (excess > 0) {
          const opponent = attacker.isOpponent ? game.player : game.opponent;
          opponent.damageTaken += excess;
          opponent.health = Math.min(99,Math.max(0, opponent.health - excess));
          game.lastCardDealingDamage = attacker;
          this.breakRunesIfNeeded(game, opponent);
          if (outputLogs) console.log(`Breakthrough: ${excess} excess damage to face`);
          // Pilfer effect on breakthrough excess
          game.thief = attacker;
          attacker.effects?.forEach(effect => {
            if (effect.trigger !== 'Pilfer') return;
            // Auto-target effects → resolve immediately
            if (this.isAutoTarget(effect.target)) {
              if (outputLogs) console.log('Pilfer triggered for: ', attacker.name)
              this.executeEffect(effect, attacker, game);
            } else {
              if (outputLogs) console.log('no auto target for pilfer target: ', effect.target)
            }
          });
          this.runEffects('FriendlyPilfer',owner, game);
        }
      }
      // Lethal: target dies
      if (isLethal && !defenderImmuneLethal && target.currentHealth > 0) {
        target.currentHealth = 0; // target dies
        if (outputLogs) console.log(`${target.name} was killed by Lethal`);
      }
      game.lastCardReceivingDamage = target;
      attacker.totalDamageDealt = (attacker.totalDamageDealt ?? 0) + damageDealt;
      attacker.effects?.forEach(effect => {
        if (effect.trigger !== 'DamageDealt') return;
        this.executeEffect(effect, attacker, game);
      });
      game.lastDamageTaken = damageDealt;
      target.effects?.forEach(effect => {
          if (effect.trigger !== 'DamageTaken') return;
              
          this.queuePendingAction(game, {
              type: 'audio',
              sourceCard: target,
              prompt: 'hit'
          });
        this.executeEffect(effect, target, game);
      });
    }

    // Attacker takes retaliation damage (unless target died to Ward or lethal)
    if (target.currentAttack! > 0) {
      if (isImmuneToDragons && defenderIsDragon) {
        if (outputLogs) console.log('attacker immune to dragons');
      } else {
        if (outputLogs) console.log(`${target.name} retaliates for ${target.currentAttack} damage`);
        if (isWard) {
          // Attacker's Ward blocks all damage this time
          attacker.currentKeywords = attacker.currentKeywords?.filter(k => k !== 'Ward');
          if (outputLogs) console.log(`${attacker.name} Ward blocked all retaliation damage`);
          attacker.effects?.forEach(effect => {
          if (effect.trigger !== 'WardBroken') return;
            this.executeEffect(effect, attacker, game);
          });
        } else if (hasLethal && !isImmuneToLethal) {
          attacker.currentHealth = 0;
          if (outputLogs) console.log(`${attacker.name} was killed by Lethal`);
        } else {
          attacker.currentHealth = Math.max(
            0,
            (attacker.currentHealth ?? 0) - (target.currentAttack ?? 0)
          );
        }
        if (!isWard) {
          game.lastDamageTaken = target.currentAttack!;        
          attacker.effects?.forEach(effect => {
          if (effect.trigger !== 'DamageTaken') return;
            
            this.queuePendingAction(game, {
                type: 'audio',
                sourceCard: attacker,
                prompt: 'hit'
            });
            this.executeEffect(effect, attacker, game);
          });
          game.lastCardReceivingDamage = attacker;
          target.totalDamageDealt = (target.totalDamageDealt ?? 0) + target.currentAttack!;
          target.effects?.forEach(effect => {
            if (effect.trigger !== 'DamageDealt') return;
            this.executeEffect(effect, target, game);
          });
        }
      }
    }
    if (target.currentHealth! <= 0 && attacker.currentHealth! > 0) {
      // Slay effect
      game.creatureSlain = target;
      game.creatureSlayer = attacker;
      attacker.effects?.forEach(effect => {
        if (effect.trigger !== 'Slay') return;
        // Auto-target effects → resolve immediately
        if (this.isAutoTarget(effect.target)) {
          if (outputLogs) console.log('Slay triggered for: ', attacker.name)
          this.executeEffect(effect, attacker, game);
        } else {
          if (outputLogs) console.log('no auto target for slay target: ', effect.target)
        }
      });
      if (this.hasPilferSlayAura(owner)) {
        attacker.effects?.forEach(effect => {
          if (effect.trigger !== 'Pilfer') return;
          // Auto-target effects → resolve immediately
          if (this.isAutoTarget(effect.target)) {
            if (outputLogs) console.log('Pilfer=>Slay triggered for: ', attacker.name)
            this.executeEffect(effect, attacker, game);
          } else {
            if (outputLogs) console.log('no auto target for slay target: ', effect.target)
          }
        });
      }
      this.runEffects('FriendlySlay',owner, game);
      if (isLethal) this.runEffects('FriendlyLethalSlay', owner,game);
      attacker.attachedItems?.forEach(item => {
        item.effects?.forEach(itemEffect => {
          if (itemEffect.trigger !== 'Slay') return;
          // Auto-target effects → resolve immediately
          if (this.isAutoTarget(itemEffect.target)) {
            if (outputLogs) console.log('Slay triggered for: ', attacker.name)
            this.executeEffect(itemEffect, attacker, game);
          } else {
            if (outputLogs) console.log('no auto target for slay target: ', itemEffect.target)
          }
        });
      });
    }
  } else {
    // Creature vs face
    target.health = Math.max(0, target.health - damageDealt);
    target.damageTaken += damageDealt;
    game.lastCardDealingDamage = attacker;
    attacker.totalDamageDealt = (attacker.totalDamageDealt ?? 0) + damageDealt;
    attacker.effects?.forEach(effect => {
      if (effect.trigger !== 'DamageDealt') return;
      this.executeEffect(effect, attacker, game);
    });
    this.breakRunesIfNeeded(game, target as PlayerState);
    // Pilfer effect
    game.thief = attacker;
    attacker.effects?.forEach(effect => {
      if (effect.trigger !== 'Pilfer') return;
      // Auto-target effects → resolve immediately
      if (this.isAutoTarget(effect.target)) {
        if (outputLogs) console.log('Pilfer triggered for: ', attacker.name)
        this.executeEffect(effect, attacker, game);
      } else {
        if (outputLogs) console.log('no auto target for pilfer target: ', effect.target)
      }
    });
    if (attacker.effects?.some(e => e.trigger === 'Pilfer')) this.runEffects('FriendlyPilfer',owner, game);
  }
  if (damageDealt > 0) {
    
    if (isDrain) {
      const owner = attacker.isOpponent ? game.opponent : game.player;
      owner.health = Math.min(99,owner.health + damageDealt);
      if (outputLogs) console.log(`${attacker.name} drained ${damageDealt} health`);
      game.healthJustGained = damageDealt;
      this.runEffects('HealPlayer',owner, game);
      this.runEffects('FriendlyDrain',owner, game);
    }
  }

  // In playCard or opponentPlayCard
  this.logHistory(game,{
    player: attacker.isOpponent ? 'Opponent' : 'You',
    actionType: 'attack',
    description: `${attacker.name} ${isBattle ? 'battled' : 'attacked'} ${this.isCard(target) ? target.name : 'face'}`,
    details: [`Damage dealt: ${damageDealt}`]
  });

  

  // ── 3. Decrease attack counter & cleanup ────────────────────────────────
  if (!isBattle) attacker.attacks!--;
  const deathsBefore = this.currentDeathTotalThisTurn(game);
  this.checkCreatureDeath(game);
  const deathsAfter = this.currentDeathTotalThisTurn(game);
  if (deathsAfter !== deathsBefore) {
    this.checkCreatureDeath(game);
  }

  // Optional: log or show animation
  if (outputLogs) console.log(`${attacker.name} ${isBattle ? 'battled' : 'attacked'} ${this.isCard(target) ? target.name : 'face'}`);
}

breakRunesIfNeeded(game: GameState, player: PlayerState) {
  if (game.simulating) return;
  const thresholds = [25, 20, 15, 10, 5];
  const runesLeft = player.runes.filter(r => r).length; // how many were already broken
  const triggerHealth = runesLeft*5;
  //console.log("Runes: ",runesLeft, ", triggerHealth: ", triggerHealth);
  if (player.health <= triggerHealth) {
    for (const threshold of thresholds) {
      if (player.health <= threshold && threshold <= triggerHealth) {
        console.log('need to break rune');
        // Find the next intact rune and break it
        const runeIndex = player.runes.findIndex(r => r);
        if (runeIndex !== -1) {
          this.logHistory(game,{
            player: player === game.player ? 'You' : 'Opponent',
            actionType: 'rune-break',
            description: `${player === game.player ? 'You' : 'Opponent'} lost a rune!`,
            details: [`Health at ${player.health}`]
          });
          player.runes[runeIndex] = false;
          //trigger DestroyRune for effects by opposing player
          this.runEffects('DestroyRune',
            player === game.player ? game.opponent : game.player, game);
          // Draw a card for the player whose runes broke            
          this.drawForProphecy(game, player);
          console.log(`${player === game.player ? 'You' : 'Opponent'} broke a rune and drew a card!`);
        }
        break; // only break one per damage instance
      }
    }
  }
  const newRunesLeft = player.runes.filter(r => r).length;
  if ((!game.stagedProphecy || (game.cpuPlaying && player === game.opponent)) && newRunesLeft !== runesLeft) {
    this.breakRunesIfNeeded(game, player); // Check if we need to break another rune if multiple thresholds were crossed
  }
}

private drawForProphecy(game: GameState, player: PlayerState) {
  if (player.deck.length === 0) {
    console.log('no cards left to draw for prophecy');
    return;
  }
  let topCard = player.deck[0];
  /*if (this.forceProphecyForTesting) {
    //code to force prophecy card draw for testing
    const prophecyIndex = player.deck.findIndex(c => c.prophecy === true);
    if (prophecyIndex !== -1) {
      topCard = player.deck.splice(prophecyIndex, 1)[0];
    }
  }*/
  
  console.log('Top card:', topCard?.name, '; isOpponent:', topCard?.isOpponent, '; prophecy:', topCard?.prophecy);
  if (topCard.prophecy) {
    const oppPlayer = player === game.player ? game.opponent : game.player;
    this.runEffects('OppProphecy',oppPlayer,game);
    if (player === game.player || !game.cpuPlaying) {
      this.offerProphecyPlay(game, topCard);
    } else {
      const played = game.opponent.deck.shift()!;
      //this.triggerProphecyFlash();
      this.queuePendingAction(game, {
          type: 'prophecy'
      });
      this.opponentAutoPlayProphecy(game, topCard);
      this.logHistory(game,{
        player: 'Opponent',
        actionType: 'prophecy-play',
        description: 'Opponent played a free Prophecy card!',
        details: [`Card: ${topCard.name}`]
      });
    }
  } else {
    console.log('No prophecy triggered.');
    this.drawCards(player, 1, game);
  }
}

private opponentAutoPlayProphecy(game: GameState, card: Card) {
  console.log(`🤖 Opponent auto-playing Prophecy: ${card.name}`);

  // Play using AI logic (no magicka cost, not from hand)
  switch (card.type) {
    case 'Creature': {
      const lanes = [0, 1].filter(l => game.opponent.board[l].length < 4);
      if (lanes.length > 0) {
        let lane = this.utilityService.random(lanes);
        if (game.laneTypes[lane] === 'Disabled') lane = 1 - lane;
        this.opponentPlayCard(game, card, lane, undefined, true); // true = free play
        this.logOpponent(`Prophecy: Played "${card.name}" to ${game.laneTypes[lane]} Lane`);
      }
      break;
    }

    case 'Item': {
      const targets = this.getOpponentCreatures(game);
      if (targets.length > 0) {
        const target = this.utilityService.random(targets);
        this.opponentPlayCard(game, card, undefined, target, true); // true = free play
        this.logOpponent(`Prophecy: Played "${card.name}" on "${target.name}"`);
      }
      break;
    }

    case 'Support': {
      this.opponentPlayCard(game, card, undefined, undefined, true); // free play
      this.logOpponent(`Prophecy: Played "${card.name}"`);
      break;
    }

    case 'Action': {
      // Use AI targeting for Actions
      const playEffects = card.effects?.filter(e => e.trigger === 'Play') || [];
      let target: Card | PlayerState | undefined = undefined;

      for (const effect of playEffects) {
        if (this.isAutoTarget(effect.target)) continue;
        target = this.getActionTarget(game, card, effect, true);
        if (target) break;
      }

      this.opponentPlayCard(game, card, undefined, target, true); // free play
      this.logOpponent(
        target 
          ? `Prophecy: Played "${card.name}" on "${(target as any).name || 'face'}"`
          : `Prophecy: Played "${card.name}"`
      );
      break;
    }
  }

  // Discard the card (prophecy goes to discard after play)
  // Note: not added to hand at all
}

private offerProphecyPlay(game: GameState, card: Card) {
  game.stagedProphecy = card;
  //this.cancelButtonActive = true;
  console.log(`Prophecy offered: ${game.stagedProphecy.name} (play for free)`);
}

private checkCreatureDeath(game: GameState) {
    const useLogs = game.simulating ? false : true;
    if (game.isProcessingDeath) {
      if (useLogs) console.warn("checkCreatureDeath called recursively — skipping");
      return;
    }

    game.isProcessingDeath = true;

    try {
      const deaths: { player: PlayerState; creature: Card; laneIndex: number }[] = [];

      // Phase 1: Collect all dead creatures (don't remove yet)
      [game.player, game.opponent].forEach(p => {
        p.board.forEach((lane, laneIndex) => {
          lane.forEach((creature, pos) => {
            //console.log(`${creature.name}, ${creature.isOpponent}, ${creature.laneIndex}, ${creature.currentHealth}`);
            if ((creature.currentHealth ?? 0) <= 0) {
              deaths.push({ player: p, creature, laneIndex });
            }
          });
        });
      });

      // Phase 2: Remove them and queue Last Gasp
      deaths.forEach(({ player, creature, laneIndex }) => {
        // Remove from board
        player.diedLane[laneIndex]++;
        const position = player.board[laneIndex].indexOf(creature);
        player.board[laneIndex].splice(position, 1);
        this.runEffects('CreatureFriendlyDeath',player, game);
        const oppPlayer = player === game.player ? game.opponent : game.player;
        this.runEffects('CreatureEnemyDeath',oppPlayer, game);
        [game.player, game.opponent].forEach(p => {
          p.board[laneIndex].forEach((creature) => {
            creature.effects?.forEach(effect => {
              if (effect.trigger !== 'CreatureDeathThisLane') return;
              if (this.isAutoTarget(effect.target)) {
                if (useLogs) console.log('CreatureDeathThisLane triggered for:', creature.name);
                this.executeEffect(effect, creature, game);
              } else {
                if (useLogs) console.log('No auto target for CreatureDeathThisLane:', effect.target);
                // TODO: handle manual target selection for Last Gasp (rare)
              }
            });
          });
        });
        // Move to discard (fresh copy)
        const lastGaspShuffle = creature.effects?.some(e => e.trigger === 'LastGasp' && 
          e.type === 'shuffleIntoDeck' && e.target === 'self');
        if (creature.banished) {
          if (useLogs) console.log('skipping putting creature in discard for banish tag');
        } else if (lastGaspShuffle) {
          if (useLogs) console.log('skipping putting creature in discard for shuffle effect');
        } else {
          const original = this.deckService.getCardById(creature.id);
          if (original) {
            const fresh = this.deckService.cloneCardForGame(original, creature.isOpponent!);
            player.discard.push(fresh);
          }
        }

        // Move attached items to discard
        creature.attachedItems?.forEach(item => {
          const origItem = this.deckService.getCardById(item.id);
          if (origItem) {
            player.discard.push(this.deckService.cloneCardForGame(origItem, item.isOpponent || false));
          }
        });

        // Log death
        this.logHistory(game,{
          player: creature.isOpponent ? 'Opponent' : 'You',
          actionType: 'death',
          description: `${creature.isOpponent ? 'Opp' : 'You'}: ${creature.name}`,
          details: []
        });
        if (useLogs) console.log(`${creature.name} died!`);

        // Remove auras this creature owned
        this.reverseAurasOnTarget(game, creature);
      });

      // Phase 3: Now trigger Last Gasp on all dead creatures (after removal)
      deaths.forEach(({ player, creature }) => {
        this.queuePendingAction(game, {
          type: 'audio',
          sourceCard: creature,
          prompt: 'lastgasp'
        });
        creature.effects?.forEach(effect => {
          if (effect.trigger !== 'LastGasp') return;

          

          if (this.isAutoTarget(effect.target)) {
            if (useLogs) console.log('Last Gasp triggered for:', creature.name);
            this.executeEffect(effect, creature, game);
          } else {
            if (useLogs) console.log('No auto target for Last Gasp:', effect.target);
            // TODO: handle manual target selection for Last Gasp (rare)
          }
        });

        // Also trigger Last Gasp on attached items if they had any
        creature.attachedItems?.forEach(item => {
          item.effects?.forEach(effect => {
            if (effect.trigger !== 'LastGasp') return;
            if (this.isAutoTarget(effect.target)) {
              if (useLogs) console.log('Last Gasp triggered for attached item:', item.name);
              this.executeEffect(effect, item, game);
            }
          });
        });
      });
    } finally {
      game.isProcessingDeath = false;
    }

    this.updateStaticBuffs(game, game.player);
    this.updateStaticBuffs(game, game.opponent);

    // NEW: Check if either player is at 0 or below health

    if (game.player.health <= 0) {
      this.handleGameOver(game, true);
      return;
    }

    if (game.opponent.health <= 0) {
      this.handleGameOver(game, false);
    }
  }   

  getValidTargets(game: GameState, targetType: TargetType, 
      sourceCard: Card, 
      sourceLane?: number): (Card | PlayerState)[] {
      
      const targets: (Card | PlayerState)[] = [];
  
      switch (targetType) {
  
        case 'any':
          targets.push(game.player, game.opponent);
          this.getAllCreatures(game).forEach(c => targets.push(c));
          break;
  
        case 'creature':
          // Any single creature (friendly or enemy)
          this.getAllCreatures(game).forEach(c => targets.push(c));
          break;

        case 'creatureOther': {
          let refSource = sourceCard;
          if (sourceCard.type === 'Item') {
            refSource = this.findWielderOfItem(game,sourceCard)!;
          }
          const candidates = this.getAllCreatures(game).filter(c => c !== refSource);
          candidates.forEach(c => targets.push(c));
          break;
        }
  
        case 'creatureWounded':
          // Any single creature (friendly or enemy)
          this.getAllCreatures(game).forEach(c => {
              if (this.deckService.isWounded(c)) {
                targets.push(c);
              }
            });
          break;
  
        case 'creatureEnemy':
          if (sourceCard.isOpponent) {
            this.getPlayerCreatures(game).forEach(c => targets.push(c));
          } else {
            this.getEnemyCreatures(game).forEach(c => targets.push(c));
          }
          break;
  
        case 'creatureEnemyWounded':
          if (sourceCard.isOpponent) {
            this.getPlayerCreatures(game).forEach(c => {
              if (this.deckService.isWounded(c)) {
                targets.push(c);
              }
            });
          } else {
            this.getEnemyCreatures(game).forEach(c => {
              if (this.deckService.isWounded(c)) {
                targets.push(c);
              }
            });
          }
          break;
  
        case 'creatureEnemyThisLane':
          if (sourceLane !== undefined) {
            if (sourceCard.isOpponent) {
              return game.player.board[sourceLane];
            } else {
              return game.opponent.board[sourceLane];
            }
          }
          return [];

        case 'creatureThisLane':
          if (sourceLane !== undefined) {
            return [...game.player.board[sourceLane], ...game.opponent.board[sourceLane]];          
          }
          return [];
  
        case 'creatureFriendly':
          if (sourceCard.isOpponent) {
            this.getEnemyCreatures(game).forEach(c => targets.push(c));
          } else {
            this.getPlayerCreatures(game).forEach(c => targets.push(c));
          }
          break;
  
        case 'creatureFriendlyOther':
          // Friendly creatures EXCEPT the source card itself
          if (sourceCard.isOpponent) {
            this.getEnemyCreatures(game).forEach(c => {
              if (c !== sourceCard) targets.push(c);
            });
          } else {
            this.getPlayerCreatures(game).forEach(c => {
              if (c !== sourceCard) targets.push(c);
            });
          }
          break;
  
        case 'creatureFriendlyOtherThisLane':
          //console.log('checking creatureFriendlyOtherThisLane');
          if (sourceLane !== undefined) {
            if (sourceCard.isOpponent) {
              game.opponent.board[sourceLane].forEach(c => {
                if (c !== sourceCard) targets.push(c);
              });
            } else {
              game.player.board[sourceLane].forEach(c => {
                console.log('checking creature: ',c.name);
                if (c !== sourceCard) targets.push(c);
              });
            }
          }
          break;
  
        case 'supportEnemy':
          if (sourceCard.isOpponent) {
            return game.player.support;
          } else {
            return game.opponent.support;
          }
  
        case 'creatureSupportEnemy':
          if (sourceCard.isOpponent) {
            return [...game.player.support, ...this.getPlayerCreatures(game)];
          } else {
            return [...game.opponent.support, ...this.getEnemyCreatures(game)];
          }

        case 'cardPlayerHand': 
          if (!sourceCard.isOpponent) {
            return game.player.hand;
          } else {
            return game.opponent.hand;
          }

        case 'creaturePlayerHand':
          if (!sourceCard.isOpponent) {
            return game.player.hand.filter(c => c.type === 'Creature');
          } else {
            return game.opponent.hand.filter(c => c.type === 'Creature');
          }

        case 'deck':
          if (!sourceCard.isOpponent) {
            return game.player.deck;
          } else {
            return game.opponent.deck;
          }
  
        case 'chooseThree':
          // Special: UI shows 3 random cards from deck/hand/etc. – handled separately
          return []; // We'll implement this as a modal later
  
        // Add more cases as needed...
        default:
          console.warn(`Unhandled target type: ${targetType}`);
          return [];
      }
  
      return targets;
    }
  
    getAllCreatures(game: GameState): Card[] {
      return [
        ...game.player.board[0],
        ...game.player.board[1],
        ...game.opponent.board[0],
        ...game.opponent.board[1]
      ];
    }
  
    getPlayerCreatures(game: GameState): Card[] {
      return [...game.player.board[0], ...game.player.board[1]];
    }
  
    getEnemyCreatures(game: GameState): Card[] {
      return [...game.opponent.board[0], ...game.opponent.board[1]];
  }

  applySupportActivation(game: GameState, support: Card, chosenTarget?: Card | PlayerState) {
      console.log(`Activated ${support.name}`);
  
      // Execute all effects with trigger "Activation"

      support.activations = (support.activations ?? 0) + 1;
      support.effects?.forEach(effect => {
      if (effect.trigger !== 'Activation') return;
        this.executeEffect(effect,support,game,chosenTarget);
      });
      this.logHistory(game,{
        player: 'You',
        actionType: 'support-activation',
        description: `Activated ${support.name}`,
        details: []
      });
      const owner = support.isOpponent ? game.opponent : game.player;
      if (!this.hasActivationLimitImmunity(owner)) {
        support.uses!--;
      }
      support.attacks!--;
      this.runEffects('ActivateSupport',owner,game);
      game.stagedSupportActivation = null;
      //this.cancelButtonActive = false;
  }

  isCardOnBoard(game: GameState, card: Card): boolean {
      if (!card.instanceId) return false;
      //const player = this.showOpponent ? this.opponent : this.player;
      return game.player.board[0].some(c => c.instanceId === card.instanceId) ||
        game.player.board[1].some(c => c.instanceId === card.instanceId) ||
        game.opponent.board[0].some(c => c.instanceId === card.instanceId) ||
        game.opponent.board[1].some(c => c.instanceId === card.instanceId);
    }

  isCardInHand(game: GameState, card: Card) : boolean {
    if (!card.instanceId) return false;
    return game.player.hand.some(c => c.instanceId === card.instanceId) ||
      game.opponent.hand.some(c => c.instanceId === card.instanceId)
  }
  
    isCardOnSupport(game: GameState, card: Card): boolean {
      return [...game.player.support,...game.opponent.support].some(c => c.instanceId === card.instanceId);
    }
  
    private applyAuraToExistingTargets(game: GameState, aura: AuraEffect) {
      const owner = aura.sourcePlayer === 'player' ? game.player : game.opponent;
  
      // Find all creatures/support that match the filter
      const allTargets = [
        ...owner.board[0],
        ...owner.board[1],
        ...owner.support
        // ... supports if needed
      ];
  
      allTargets.forEach(target => {
        if (aura.targetFilter(target) && !aura.appliedTo.has(target.instanceId!)) {
          this.applyAuraEffectToTarget(aura, target, game);
          aura.appliedTo.add(target.instanceId!);
        }
      });
    }
  
    private applyAuraEffectToTarget(aura: AuraEffect, target: Card, game: GameState) {
      if (aura.type === 'buffTarget') {
        target.currentAttack = (target.currentAttack ?? 0) + (aura.modAttack ?? 0);
        target.currentHealth = (target.currentHealth ?? 0) + (aura.modHealth ?? 0);
        target.maxHealth = (target.maxHealth ?? 0) + (aura.modHealth ?? 0);
        if (aura.keywordsToAdd?.length) {
          this.addUniqueKeywords(target,game,aura.keywordsToAdd ?? []);
        }
      } else if (aura.type === 'grantImmunity') {
        console.log(`applying immunity: ${aura.immunity} to ${target.name}`);
        if (target.immunity) {
          target.immunity.push(aura.immunity!);
        } else {
          target.immunity = [aura.immunity!];
        }
      } else if (aura.type === 'extraAttack') {
        console.log(`${target.name} gets extra attack per turn`);
        target.attacksPerTurn = (target.attacksPerTurn ?? 1) + 1;
        target.attacks = (target.attacks ?? 0) + 1;
      }
    }
  
    private reverseAuraEffects(game: GameState, aura: AuraEffect) {
      aura.appliedTo.forEach(instanceId => {
        //console.log('instanceid:', instanceId);
        // Find the target card (need a way to look up by instanceId)
        const target = this.findCardByInstanceId(game,instanceId);
        if (!target) return;
  
        if (aura.type === 'buffTarget') {
          if (this.isCard(target)) {
            target.currentAttack = Math.max(0, (target.currentAttack ?? 0) - (aura.modAttack ?? 0));
            target.currentHealth = Math.max(0, (target.currentHealth ?? 0) - (aura.modHealth ?? 0));
            target.maxHealth = Math.max(target.health ?? 0, (target.maxHealth ?? 0) - (aura.modHealth ?? 0));
            if (aura.keywordsToAdd?.length) {
              target.currentKeywords = target.currentKeywords?.filter(k => {
                // Keep "Pilfer" if the creature still has any Pilfer-triggered effect
                if (k === 'Pilfer' && this.hasPilferEffect(target)) {
                  return true;  // protect Pilfer
                }
                // Remove any other keywords that were granted by this aura
                return !aura.keywordsToAdd!.includes(k);
              }) || [];
            }
          }
        } else if (aura.type === 'grantImmunity') {
          target.immunity = target.immunity?.filter(k => k !== aura.immunity);
        } else if (aura.type === 'extraAttack') {
          target.attacksPerTurn = Math.max(1,(target.attacksPerTurn ?? 1) - 1);
          target.attacks = target.attacks! - 1;
        }
      });
    }
  
    private hasPilferEffect(card: Card): boolean {
      return card.effects?.some(effect => 
        effect.trigger === 'Pilfer'
      ) ?? false;
    }
  
    private findCardByInstanceId(game: GameState, instanceId: string): Card | undefined {
      for (const p of [game.player, game.opponent]) {
        for (const lane of p.board) {
          const found = lane.find(c => c.instanceId === instanceId);
          if (found) return found;
        }
        // Check support, hand, etc. if needed
      }
      return undefined;
  }

  logHistory(game: GameState, entry: Omit<HistoryEntry, 'turnNumber'>) {
      const newEntry = {
        ...entry,
        turnNumber: game.currentTurn
      };
      game.history.push(newEntry);
      //this.updateGroupedHistory();
      /*this.history.push({
        ...entry,
        turnNumber: this.currentTurn
      });*/
  }

  updateStaticBuffs(game: GameState, player: PlayerState) {
    const allCreatures = [...player.board[0], ...player.board[1]];
    
    allCreatures.forEach(creature => {
    if (!creature.static?.condition) return;
    const currentlyApplied = creature.staticBuffApplied ?? 0;      
    let shouldApply = 0;
    // Evaluate the condition
    switch (creature.static.condition.type) {
      case 'hasMoreCreaturesThisLane':
      const laneCreatures = [...game.player.board[creature.laneIndex ?? 0],
        ...game.opponent.board[creature.laneIndex ?? 0]];
      const friendlyCount = laneCreatures.filter(c => !c.isOpponent).length;
      const enemyCount = laneCreatures.filter(c => c.isOpponent).length;
      //console.log(`hasMoreCreaturesThisLane check: friendly: ${friendlyCount}, enemy: ${enemyCount}`);
      if (player === game.player) {
          shouldApply = friendlyCount > enemyCount ? 1 : 0;
      } else {
          shouldApply = enemyCount > friendlyCount ? 1 : 0;
      }
      break;

      case 'maxMagicka':
      shouldApply = player.maxMagicka >= (creature.static.condition.min ?? 0) ? 1 : 0;
      break;

      // Add more condition types here
      case 'handEmpty':
      shouldApply = player.hand.length === 0 ? 1 : 0;
      break;

      case 'hasItem':
      shouldApply = (creature.attachedItems && creature.attachedItems.length > 0) ? 1 : 0;
      break;

      case 'noEnemyCreaturesThisLane':
      const oppPlayer = player === game.player ? game.opponent : game.player;
      shouldApply = oppPlayer.board[creature.laneIndex!].length > 0 ? 0 : 1;
      break;

      case 'isYourTurn':
      shouldApply = player.turn ? 1 : 0;
      break;

      case 'creatureFriendlyOtherBreakthrough':
      shouldApply = this.getAmountPer(game, 'creatureFriendlyOtherBreakthrough',
          creature,creature.laneIndex);
      break;

      case 'hasHealth':
      shouldApply = player.health >= (creature.static.condition.min ?? 30) ? 1 : 0;
      break;

      default:
      console.warn(`Unknown static condition type: ${creature.static.condition.type}`);
      return;
    }

    // Apply or remove buff
    if (shouldApply > currentlyApplied) {
      // Apply buff (or increase amount)
      const amount = shouldApply - currentlyApplied;
      creature.currentAttack = (creature.currentAttack ?? 0) + (creature.static.modAttack ?? 0) * amount;
      creature.currentHealth = (creature.currentHealth ?? 0) + (creature.static.modHealth ?? 0) * amount;
      creature.maxHealth    = (creature.maxHealth ?? 0) + (creature.static.modHealth ?? 0) * amount;        
      const keywordsToAdd = creature.static.addKeywords ?? [];
      this.addUniqueKeywords(creature,game,keywordsToAdd);
      creature.staticBuffApplied = shouldApply;
      console.log(`${creature.name} gained ${amount} × +${creature.static.modAttack}/${creature.static.modHealth}`);
    } 
    else if (shouldApply < currentlyApplied) {
      // Remove buff (or decrease amount)
      const amount = currentlyApplied - shouldApply;
      creature.currentAttack = Math.max(0, (creature.currentAttack ?? 0) - (creature.static.modAttack ?? 0) * amount);
      creature.currentHealth = Math.max(1, (creature.currentHealth ?? 0) - (creature.static.modHealth ?? 0) * amount);
      creature.maxHealth    = Math.max(creature.health ?? 0, (creature.maxHealth ?? 0) - (creature.static.modHealth ?? 0) * amount);                
      const keywordsToRemove = creature.static.addKeywords ?? [];
      // Remove only the keywords that were granted by this static buff
      if (keywordsToRemove.length) {
      creature.currentKeywords = creature.currentKeywords?.filter(kw => 
          !keywordsToRemove.includes(kw)) || [];
      }
      creature.staticBuffApplied = shouldApply;
      console.log(`${creature.name} lost ${amount} × +${creature.static.modAttack}/${creature.static.modHealth}`);
    }
    });
    this.checkHandEffects(game,player);
  }

  private handleGameOver(game: GameState, isOpponent: boolean) {
    if (!game.gameRunning) {
      console.log(`extra game over ignored`);
      return;
    }
    this.logHistory(game,{
      player: isOpponent ? 'Opponent' : 'You',
      actionType: 'defeat',
      description: isOpponent ? 'You have been defeated!' : 'You win!',
      details: []
    });
    game.gameRunning = false;
    this.queuePendingAction(game, {
        type: 'gameOver',
        prompt: isOpponent ? 
        (game.cpuPlaying ? 'You lost...' : 'Top wins!') : 
        (game.cpuPlaying ? 'You win...' : 'Bottom wins!')
    });
    localStorage.removeItem('gameSave');
    if (!game.simulating) console.log(isOpponent ? "Game over — player defeated" : "Game over — player wins");
  }

  private getOutOfCards(): Card {
    return {
      id: 'out-of-cards',
      subtypes: [],
      attributes: ['N'],
      name: 'Out of Cards',
      type: 'Action',
      cost: 0,
      rarity: "4Legendary",
      text: "Destroy your front rune.",
      set: "Core Set",
      keywords: []
    } as Card;
  }

  logOpponent(message: string) {
      //this.opponentLog.push(message);
      console.log(`🤖 OPPONENT: ${message}`);
  }

  clearOpponentLog() {
      //this.opponentLog = [];
  }

  private queuePendingAction(state: GameState, action: PendingAction) {
      state.pendingActions.push(action);
      if (!state.simulating) console.log(`Queued pending action: ${action.type}`);
  }

  findBestAttackSequence(game: GameState, laneIndex: number): AttackAction | null {
    const attackers = this.getValidAttackers(game, laneIndex);
    if (attackers.length === 0) {
      console.log(`no attackers available for ${laneIndex}`);
      return null;
    } else {
      console.log(`lane ${laneIndex} valid attackers are `,attackers);
    }
    const timeLimitMs = 3000;
    const deadline = Date.now() + timeLimitMs;
    let bestScore = -Infinity;
    let bestFirstAction: AttackAction | null = null;

    const simulated = this.cloneGameState(game);
    // Evaluate "do nothing" baseline
    const noAttackScore = this.evaluateBoardState(simulated);
    bestScore = noAttackScore;
    console.log(`no attack score is ${noAttackScore}`);

    // Try all possible attack sequences
    const result = this.searchAttackTree(simulated, attackers, [], 0, deadline, (firstAction, finalScore) => {
      if (finalScore > bestScore) {
        console.log(`📈 NEW BEST: ${firstAction.attacker.name} results in score ${finalScore.toFixed(1)} (Old: ${bestScore.toFixed(1)})`);
        bestScore = finalScore;
        bestFirstAction = firstAction;
      }
    });
    console.log(`best action sequence for lane ${laneIndex} is `,bestFirstAction);
    return bestFirstAction;
  }

  private searchAttackTree(
    game: GameState,
    remainingAttackers: Card[],
    currentSequence: AttackAction[],
    depth: number,
    deadline: number,
    onBestFound: (firstAction: AttackAction, score: number) => void
  ): boolean {
    if (Date.now() > deadline) {
      console.log(`time limit for search exceeded`);
      return false;
    }
    //const simulated = game; //this.cloneGameState(game);
    const indent = "  ".repeat(depth);
    if (depth >= this.MAX_DEPTH || remainingAttackers.length === 0) {
      const score = this.evaluateBoardState(game);
      if (currentSequence.length > 0) {
        //console.log(`${indent}🏁 BASE CASE REACHED. Sequence Score: ${score.toFixed(1)}`);
        onBestFound(currentSequence[0], score);
      } else {
        //console.log(`${indent}💤 BASE CASE REACHED (All Skipped). Score: ${score.toFixed(1)}`);
      }
      return score >= 100000;
    }


    // Loop through EVERY remaining attacker to test different ORDERS
    for (let i = 0; i < remainingAttackers.length; i++) {
      const attacker = remainingAttackers[i];
      const targets = this.getValidTargetsForAttacker(game, attacker);
      const nextRemaining = [
        ...remainingAttackers.slice(0, i),
        ...remainingAttackers.slice(i + 1)
      ];

      for (const target of targets) {
        // 1. Simulate the attack
        const targetName = this.isCard(target) ? target.name : "Face";
        //console.log(`${indent}⚔️ DEPTH ${depth}: Testing ${attacker.name} -> ${targetName}`);
        const simulatedGame = this.simulateSingleAttack(game, attacker, target);

        // 2. Remove ONLY this attacker from the pool for the next branch
        const nextSequence = currentSequence.length === 0 
        ? [{ attacker, target }] 
        : currentSequence;

        // 3. Recurse
        if (this.searchAttackTree(
          simulatedGame,
          nextRemaining,
          nextSequence,
          depth + 1,
          deadline,
          onBestFound
        )) return true;
      }

      // BRANCH: What if this specific attacker stays home?
      // We still remove them from 'remaining' so we don't loop forever,
      // but we don't add an action to the sequence and don't change the game state.
      //console.log(`${indent}⏭️ DEPTH ${depth}: Skipping ${attacker.name}`);
      if (this.searchAttackTree(
        game, 
        nextRemaining, 
        currentSequence, 
        depth + 1, 
        deadline,
        onBestFound
      )) return true;
    }
    return false;
  }

  private simulateSingleAttack(game: GameState, attacker: Card, target: Card | PlayerState): GameState {
    const simulated = this.cloneGameState(game);
    simulated.useAnimation = false;
    simulated.simulating = true;
    const lane = attacker.laneIndex!;
    const realAttacker = simulated.opponent.board[lane].find(c => c.instanceId === attacker.instanceId);
    if (!realAttacker) return simulated;
    simulated.stagedAttack = realAttacker;
    let realTarget: Card | PlayerState;
    if (this.isCard(target)) {
      realTarget = [...simulated.player.board[0],...simulated.player.board[1]]
        .find(c => c.instanceId === target.instanceId)!;
    } else {
      realTarget = simulated.player; // ✅ THIS IS THE BIG FIX
    }

    this.resolveAttack(simulated, realAttacker, realTarget);

    return simulated;
  }

  private getValidAttackers(game: GameState, laneIndex: number): Card[] {
    return game.opponent.board[laneIndex].filter(c =>
      (c.attacks ?? 0) > 0 &&
      !c.shackled &&
      !c.sick &&
      (c.currentAttack ?? 0) > 0 && 
      (!c.attackCondition ||
      this.isAttackConditionMet(c.attackCondition,c.laneIndex,
        c.isOpponent ? game.opponent : game.player))
    );
  }

  private getValidTargetsForAttacker(game: GameState, attacker: Card): (Card | PlayerState)[] {
    return this.getOpponentValidAttackTargets(game,attacker);
  }

  private evaluateBoardState(game: GameState): number {
    const cpu = game.opponent;
    const user = game.player;

    // 1. Terminal States (Win/Loss)
    // If the user is dead, this is the best possible outcome for CPU
    if (user.health <= 0) return 100000; 
    // If the CPU is dead (e.g. from a 'Last Gasp' or 'Reflect' effect during simulation)
    if (cpu.health <= 0) return -100000;

    let score = 0;
    //console.log(`player health in this iteration is ${user.health}`);
    // 2. Life Totals (Weighted higher when health is low - "Lethal Pressure")
    score += (cpu.health * 10);
    score -= (user.health * 15); // Pressure the user more than protecting self

    // 3. Material & Board Value
    score += this.calculateSideValue(cpu.board);
    score -= this.calculateSideValue(user.board);

    // 4. Resource Advantage (Hand size & Magicka)
    score += (cpu.hand.length * 5);
    score -= (user.hand.length * 5);
    score += (cpu.maxMagicka * 2);

    return score;
  }

  private calculateSideValue(lanes: Card[][]): number {
    let sideValue = 0;
    lanes.forEach(lane => {
      lane.forEach(card => {
        if (card.type !== 'Creature') return;

        // Base Stats
        const attackValue = card.currentAttack ?? 0;
        const healthValue = card.currentKeywords?.includes('Regenerate') ? 
          (card.maxHealth ?? card.health) : 
          (card.currentHealth ?? card.health);
        let cardValue = attackValue * 8;
        cardValue += healthValue! * 6;

        // Keyword Multipliers (Positioning)
        if (card.currentKeywords?.includes('Guard')) cardValue += 20;
        if (card.currentKeywords?.includes('Lethal')) cardValue += 35;
        if (card.currentKeywords?.includes('Ward')) cardValue += attackValue* 4; // Ward on high attack is scary
        if (card.currentKeywords?.includes('Drain')) cardValue += 10;
        if (card.currentKeywords?.includes('Breakthrough')) cardValue += 15;
        if (card.currentKeywords?.includes('Rally')) cardValue += 20;

        if (card.immunity && card.immunity.length > 0) cardValue += 20;
        
        card.effects?.forEach(e => {
          if (e.trigger !== 'Summon') cardValue += 20;
        });          
        
        // Negative value for shackled/sick cards (temporary uselessness)
        if (card.frozen) {
          cardValue *= 0.3;
        } else if (card.shackled || card.sick) {
          cardValue *= 0.7;
        }

        sideValue += cardValue;
      });
    });
    return sideValue;
  }

  cloneGameState(game: GameState): GameState {
    return {
      ...game,
      player: this.clonePlayer(game.player),
      opponent: this.clonePlayer(game.opponent),
      history: [...game.history],
      pendingActions: [...game.pendingActions]
    };
  }

  clonePlayer(player: PlayerState): PlayerState {
    return {
      ...player,
      hand: player.hand.map(c => this.cloneCard(c)),
      deck: player.deck.map(c => this.cloneCard(c)),
      discard: player.discard.map(c => this.cloneCard(c)),
      limbo: player.limbo.map(c => this.cloneCard(c)),
      support: player.support.map(c => this.cloneCard(c)),
      board: player.board.map(lane => lane.map(c => this.cloneCard(c))),
      auras: player.auras.map(aura => ({
        ...aura,
        appliedTo: new Set(aura.appliedTo) 
      })),
      runes: [...player.runes],
      diedLane: [...player.diedLane],
      cardUpgrades: { ...player.cardUpgrades },
      playCounts: { ...player.playCounts }
    };
  }

  cloneCard(card: Card): Card {
    return {
      ...card,
      currentKeywords: card.currentKeywords ? [...card.currentKeywords] : [],
      immunity: card.immunity ? [...card.immunity] : [],
      tempKeywords: card.tempKeywords ? [...card.tempKeywords] : [],
      effects: card.effects ? card.effects.map(e => ({ ...e })) : [],
      attachedItems: card.attachedItems ? card.attachedItems.map(c => this.cloneCard(c)) : []
    };
  }


}