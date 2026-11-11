# Graph Report - cardDungeonExplorer  (2026-11-11)

## Corpus Check
- 159 files · ~193,278 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .css 7, (none) 2)

## Summary
- 1699 nodes · 5995 edges · 65 communities (62 shown, 3 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 112 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `856db6c4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- getEnemyIntent
- timelineDrag.ts
- Визуальные эффекты
- card.ts
- Замеры баланса акта 1
- cityServices.js
- onClock
- sim-merge.js
- audio.js
- engine/combat.ts
- showScreen
- deck.ts
- План переделки и этапы
- Тесты боя
- timeline.ts
- playSound
- save.ts
- Зависимости проекта
- animations.js
- chainBonusMet
- Маг и статусы
- Разбор механик и события
- Особенности классов
- showTooltip
- Воин и броня
- types.ts
- bot.js
- Алхимик и зелья
- effects.ts
- run.ts
- Враги акта 5
- runBar.js
- map.ts
- Реликвии
- Враги акта 4 и печать
- sim-run.js
- save.test.ts
- ghost.md
- Настройки TypeScript
- Бонусы цепочки
- Убийца и Комбо
- Враги акта 1 и арена
- dungeon.js
- cardsAlchemist.ts
- Карта подземелья
- Враги актов 2–3
- Чернокнижник и Тьма
- Враги акта 9
- Враги акта 7
- city.js
- timelineControl.test.ts
- Манифест PWA
- tutorial.ts
- getCardData
- Враги акта 6
- rules.ts
- Таблица баланса: правила для всех чисел игры
- hpBar.js
- meta.ts
- questDialog.js
- Враги акта 10
- Фазы боссов и вампиризм
- Враги акта 8
- Наклон карт
- animationMs

## God Nodes (most connected - your core abstractions)
1. `el()` - 181 edges
2. `showScreen()` - 81 edges
3. `playSound()` - 52 edges
4. `showTooltip()` - 43 edges
5. `loadMeta()` - 39 edges
6. `Починка` - 38 edges
7. `TEXTS` - 34 edges
8. `Сокрушение` - 34 edges
9. `Враги 1 акта, арена и боссы актов 1–3 (было → стало)` - 33 edges
10. `getCardData()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `damageOf()` --calls--> `getCardData()`  [EXTRACTED]
  tests/levels.test.ts → js/engine/deck.ts
- `inBossRoom()` --calls--> `createRun()`  [EXTRACTED]
  tests/abyss.test.ts → js/engine/run.ts
- `index.html app shell (Такт клинка PWA)` --conceptually_related_to--> `Stage 9: full visual redesign`  [INFERRED]
  index.html → docs/PLAN.md
- `runFight()` --calls--> `createCombat()`  [EXTRACTED]
  tools/bot.js → js/engine/combat.ts
- `listActions()` --calls--> `cardWeight()`  [EXTRACTED]
  tools/bot.js → js/engine/combat.ts

## Import Cycles
- 2-file cycle: `js/ui/screens/city.js -> js/ui/screens/dungeon.js -> js/ui/screens/city.js`
- 2-file cycle: `js/ui/components/timeline.ts -> js/ui/timelineDrag.ts -> js/ui/components/timeline.ts`

## Hyperedges (group relationships)
- **Armor break system: Vulnerability, Sunder, Repair, block repair** — docs_plan_vulnerability_armor, docs_plan_sunder, docs_plan_repair, docs_plan_block_repair_rule, docs_plan_damage_formula [EXTRACTED 1.00]
- **Новые механики движка для врагов (этап 5)** — docs_enemies_act1_фазы_боссов, docs_enemies_act1_призыв_помощника, docs_enemies_act1_вампиризм, docs_enemies_act1_скрытые_ходы, docs_enemies_act1_ледяная_печать, docs_enemies_act1_сокрушение, docs_enemies_act1_починка [EXTRACTED 1.00]
- **Five classes reworked together on the timeline** — docs_plan_warrior, docs_plan_assassin, docs_plan_mage, docs_plan_alchemist, docs_plan_warlock [EXTRACTED 1.00]
- **Четыре новые особенности шкалы актов 4–10** — docs_enemies_act4_трясина, docs_enemies_act4_железная_дисциплина, docs_enemies_act4_иней, docs_enemies_act4_натиск [EXTRACTED 1.00]
- **Бои акта 1 «Катакомбы»** — tools_baseline_act1_floor0_культист, tools_baseline_act1_floor0_скелет, tools_baseline_act1_floor0_паук, tools_baseline_act1_floor0_падший_рыцарь, tools_baseline_act1_floor0_могильный_пёс, tools_baseline_act1_floor0_хранитель_склепа [EXTRACTED 1.00]
- **Пять классов героев** — tools_baseline_act1_floor0_воин, tools_baseline_act1_floor0_убийца, tools_baseline_act1_floor0_чернокнижник, tools_baseline_act1_floor0_алхимик, tools_baseline_act1_floor0_маг [EXTRACTED 1.00]
- **Итерации выравнивания классов акта 1** — tools_baseline_run_act1_balanced, tools_baseline_run_act1_relics, tools_baseline_run_act1_strength, tools_baseline_run_act1_zero_weight, tools_baseline_run_act1_final_stage5, tools_baseline_run_act1_manual1 [INFERRED 0.85]
- **Боссы актов с фазами и своим приёмом на шкале** — docs_enemies_act1_фазы_боссов, docs_enemies_act1_хранитель_склепа, docs_enemies_act1_лорд_вампиров, docs_enemies_act1_король_лич, docs_enemies_act4_матерь_топей, docs_enemies_act5_владыка_цитадели, docs_enemies_act6_пожиратель_света, docs_enemies_act7_повелитель_горна, docs_enemies_act8_чумной_владыка, docs_enemies_act9_король_легиона, docs_enemies_act10_сердце_бездны [INFERRED 0.95]
- **One class-specific Repair card in each starting deck** — docs_cards_warrior_patch_up, docs_cards_assassin_tighten_straps, docs_cards_mage_rune_of_protection, docs_cards_warlock_bone_patches, docs_cards_alchemist_resin [INFERRED 0.95]

## Communities (65 total, 3 thin omitted)

### Community 0 - "getEnemyIntent"
Cohesion: 0.29
Nodes (10): currentPattern(), describeMove(), enemySchedule(), fillEnemyLane(), getEnemyIntent(), getEnemyLane(), isHidden(), calculateBlock() (+2 more)

### Community 1 - "timelineDrag.ts"
Cohesion: 0.25
Nodes (12): pointOnTrack(), enableHandGestures(), HandEntry, HandGestureOptions, Mode, DragOptions, DragSession, dragState (+4 more)

### Community 2 - "Визуальные эффекты"
Cohesion: 0.11
Nodes (66): getAnimationSpeed(), ARCANE, bolt(), burst(), CARD_VFX, drawFrame(), drawParticle(), EFFECTS (+58 more)

### Community 3 - "card.ts"
Cohesion: 0.06
Nodes (64): getCardRarity(), getBonus(), getHeroFilter(), CardInstance, applyHeroLook(), ATTACK_STYLES, ELDER_ART, enemySprite() (+56 more)

### Community 4 - "Замеры баланса акта 1"
Cohesion: 0.17
Nodes (44): Эталон сложности акт 1, этаж 0 (400 вариантов), Бот проверяет 400 вариантов за ход, Акт 1 «Катакомбы», Алхимик, Воин, Культист, Маг, Могильный пёс (элита) (+36 more)

### Community 5 - "cityServices.js"
Cohesion: 0.06
Nodes (65): COSMETICS, attack(), buff(), extras(), guard(), MoveOptions, addPotionToCombat(), addRelicToCombat() (+57 more)

### Community 6 - "onClock"
Cohesion: 0.16
Nodes (21): captureCombatView(), moveTimelinePointer(), setTimelineProgress(), advanceFlight(), buildDamageLog(), doTick(), finishCombatIfOver(), Flight (+13 more)

### Community 7 - "sim-merge.js"
Cohesion: 0.22
Nodes (9): actNumbers, args, cell(), [dir, ...rest], heroes, lines, parts, runs (+1 more)

### Community 8 - "audio.js"
Cohesion: 0.11
Nodes (36): loadSettings(), resetProgress(), saveSettings(), applyVolumes(), buffers, decodeCompact(), fadeOutMusic(), FIXED_PITCH (+28 more)

### Community 9 - "engine/combat.ts"
Cohesion: 0.08
Nodes (62): addPotion(), arrangeLane(), brewCardsInTact(), canAct(), canPlayCard(), cardWeight(), chainLane(), ChainLink (+54 more)

### Community 10 - "showScreen"
Cohesion: 0.10
Nodes (41): ICON_AUTHORS, MODEL_CREDITS, SOUND_CREDITS, TEXTS, getEventData(), saveRun(), state, resetPlayTimer() (+33 more)

### Community 11 - "deck.ts"
Cohesion: 0.18
Nodes (10): chainBonuses(), createCardInstance(), createPiles(), LADDER, Leveled, scaleCard(), SCALED, scaleEffects() (+2 more)

### Community 12 - "План переделки и этапы"
Cohesion: 0.08
Nodes (24): partThree working branch, CLAUDE.md project instructions (Такт клинка), Verification gate: npm test + typecheck + build, Block lasts 6 cells (portions), Difficulty target: ~70% act-1 clear, falling per act, Draw: each fired card brings one new, hand max 10, Enemies, relics, potions, saves impact table, Enemy lanes and move weights (Дорожки врагов) (+16 more)

### Community 13 - "Тесты боя"
Cohesion: 0.16
Nodes (26): addCardToHand(), advance(), brewBlocksTime(), createCombat(), createEnemy(), launch(), previewLaunch(), ChainBonus (+18 more)

### Community 14 - "timeline.ts"
Cohesion: 0.17
Nodes (21): ActionPreview, createBadge(), appendTactLines(), createEnemyTrack(), createHeroTrack(), createPrepTrack(), createRow(), createTimeline() (+13 more)

### Community 15 - "playSound"
Cohesion: 0.11
Nodes (50): focusedEnemy(), shakeCard(), createStatusIcons(), afterChange(), aliveEnemies(), buildTimeline(), canAct(), canPrepare() (+42 more)

### Community 16 - "save.ts"
Cohesion: 0.12
Nodes (37): getDeepestFloor(), awardArenaWin(), activeSlot, clearRun(), decodeBase64(), DEFAULT_SETTINGS, deleteSlot(), encodeBase64() (+29 more)

### Community 17 - "Зависимости проекта"
Cohesion: 0.08
Nodes (28): devDependencies, playwright-core@^1.65.0, sharp@^0.35.5, @types/node@^26.6.6, typescript@^7.0.2, vite@^8.3.6, vite-plugin-pwa@^2.0.0, vitest@^5.1.0 (+20 more)

### Community 18 - "animations.js"
Cohesion: 0.17
Nodes (37): actionRawMs(), allUnits(), animate(), animateHpBar(), castAnimation(), castProjectile(), centerOf(), discardHandView() (+29 more)

### Community 19 - "chainBonusMet"
Cohesion: 0.83
Nodes (4): chainBonusMet(), chainPosition(), linksTouch(), switchesTarget()

### Community 20 - "Маг и статусы"
Cohesion: 0.12
Nodes (22): Card: Походная лаборатория (Field Lab), Mage cards: было → стало (35 → 52), Card: Уголёк (Ember), Card: Ледяная стрела (Ice Arrow) Slow, Card: Инферно (Inferno) weight 5 → 4, Card: Метеор (Meteor) Finale, Card: Перегрузка (Overload) +1 Tide per tact, Card: Пиробласт (Pyroblast) (+14 more)

### Community 21 - "Разбор механик и события"
Cohesion: 0.11
Nodes (24): Events: было → стало (22 events, 7 encounters), Event: Доспехи павшего (Fallen Knight Armor), Event: Зал зеркал (Hall of Mirrors), Event: Старая карта (Old Map), Encounter: Карманник (Pickpocket) steals potion, Event: Мастерская (Workshop), Act features (Трясина, Иней, Жар, Натиск…), Bosses with phases and timeline trick (+16 more)

### Community 22 - "Особенности классов"
Cohesion: 0.22
Nodes (8): Алхимик — зелья в бою, Воин — танк в доспехах, Маг — подготовка заклинаний, Общий каркас колоды, Особенности классов, Убийца — длинные цепочки, Чернокнижник — сила за кровь, Что меняется в движке

### Community 23 - "showTooltip"
Cohesion: 0.22
Nodes (17): canReturnToCity(), getCurrentFloor(), getActiveSlot(), showTooltip(), continueRun(), createButton(), createRemoveButton(), createSlot() (+9 more)

### Community 24 - "Воин и броня"
Cohesion: 0.11
Nodes (22): Card: Кислота (Acid) Sunder, Card: Панацея (Panacea) Repair 10, Card: Смола (Resin) — Alchemist starter repair, Card: Подтянуть ремни — Assassin starter repair, Card: Руна защиты — Mage starter repair, Upgrade tiers formula (+20% per tier, round up), Card: Сокрушение (Bash) Sunder 2, Card: Рассечение (Cleave) 8 to all (+14 more)

### Community 25 - "types.ts"
Cohesion: 0.06
Nodes (38): EVENTS, TRAVEL_EVENTS, RunSetup, GameState, ActionResult, ActiveEvent, BlockPortion, Bonus (+30 more)

### Community 26 - "bot.js"
Cohesion: 0.07
Nodes (36): CONFIG, ACTS, CARDS, ENEMIES, HEROES, POTIONS, RELICS, getRarityWeights() (+28 more)

### Community 27 - "Алхимик и зелья"
Cohesion: 0.12
Nodes (21): Card: Бомба (Bomb) 5 to all, Card: Варка зелья (Brew Potion), Alchemist cards: было → стало (29 → 50), Card: Взрыв эликсира (Elixir Blast), Card: Трансмутация (Transmutation), Zero-weight cards: strict rule, Event: Странные часы (Strange Clock), Alchemist class (Алхимик) — brewing, potions weight 0 (+13 more)

### Community 28 - "effects.ts"
Cohesion: 0.07
Nodes (29): absoluteTime(), addBlock(), boostEffects(), CombatEffectType, DamageBreakdown, DamageTarget, EFFECT_HANDLERS, ETERNAL_BLOCK (+21 more)

### Community 29 - "run.ts"
Cohesion: 0.09
Nodes (48): getMaxPotions(), startEvent(), startTravelEvent(), pickRandom(), addCardToDeck(), addRelic(), applyRelicTrigger(), applyRunEffects() (+40 more)

### Community 30 - "Враги акта 5"
Cohesion: 0.14
Nodes (18): Безликий, Пожиратель разума, Королева ведьм, Призрак, Разбойник, Болотная ведьма, Акт 5 «Цитадель тьмы»: враги, Без передышки (+10 more)

### Community 31 - "runBar.js"
Cohesion: 0.25
Nodes (17): getRestHealAmount(), getUpgradableCards(), restHeal(), restUpgrade(), createCombatItems(), createIconButton(), createItemColumns(), createItemsRow() (+9 more)

### Community 32 - "map.ts"
Cohesion: 0.14
Nodes (32): buildAbyssAct(), cache, getAbyssCircle(), getActData(), isAbyssAct(), mergeMechanics(), pickMechanics(), pickSome() (+24 more)

### Community 33 - "Реликвии"
Cohesion: 0.18
Nodes (16): Card: Некромантия (Necromancy) weight 1, Event: Кузнец в подземелье (Dungeon Blacksmith), Zero-weight cards (Карты весом 0), Relic: Астролябия (Astrolabe) — Mage, prep ×2, Relic: Кровавый алтарь (Blood Altar) — Warlock, Class relics (drop only for own hero), Boss relic: Корона углей (Crown of Embers), Boss relic: Сердце бездны (Heart of the Abyss) Finale twice (+8 more)

### Community 34 - "Враги акта 4 и печать"
Cohesion: 0.18
Nodes (15): Страж бездны, Король-лич, Послушник лича, Акт 4 «Ядовитые топи»: враги и особенность шкалы, Болотная пиявка, Грибник, Железная дисциплина, Иней (+7 more)

### Community 35 - "sim-run.js"
Cohesion: 0.13
Nodes (34): chooseEventOption(), finishEvent(), createMeta(), createNodeCombat(), createRun(), enterNode(), finishCombat(), getAvailableNodeIds() (+26 more)

### Community 39 - "Настройки TypeScript"
Cohesion: 0.13
Nodes (14): compilerOptions, allowImportingTsExtensions, allowJs, checkJs, isolatedModules, lib, module, moduleResolution (+6 more)

### Community 40 - "Бонусы цепочки"
Cohesion: 0.21
Nodes (13): Card: Ступка (Mortar) Finale + Reagent, Card: Идеальное убийство (Perfect Kill), Card: Приговор (Verdict) Chain 5, Two chain bonuses on rare cards: было → стало, Card: Палач (Executioner) Finale Sunder, Chain bonus «После атаки/навыка» (Link), Chain bonus «Цепь N» (Chain N), Chain bonus «Финал» (Finale) (+5 more)

### Community 41 - "Убийца и Комбо"
Cohesion: 0.22
Nodes (14): Card: Кровопускание (Bloodletting) Bleed, Card: Цепь ударов (Chain of Strikes) power, Assassin cards: было → стало (86 → 69), Card: Добивание (Finisher) +3 per Combo, Card: Подготовка (Preparation) Haste 1, Assassin starting deck (Уколы, Ножи, Перекаты), Card: Темп (Tempo) Chain 3 Haste, Assassin class (Убийца) — long chains, draw 8 (+6 more)

### Community 42 - "Враги акта 1 и арена"
Cohesion: 0.22
Nodes (9): Враги 1 акта, арена и боссы актов 1–3 (было → стало), Культист, Могильный пёс, Паук, Рыцарь смерти, Скелет, Стая крыс, Хранитель склепа (+1 more)

### Community 43 - "dungeon.js"
Cohesion: 0.18
Nodes (24): getPreviousNodeId(), isNodeCleared(), isNodeRevealed(), createCityButton(), createCorridor(), createCorridorActions(), createFirefliesButton(), createHatch() (+16 more)

### Community 44 - "cardsAlchemist.ts"
Cohesion: 0.08
Nodes (59): allStatus(), block(), brew(), burn, card(), chained(), cheaperPower(), damage() (+51 more)

### Community 45 - "Карта подземелья"
Cohesion: 0.32
Nodes (13): createLine(), createLines(), createMapContent(), createNode(), createSaveHint(), createTeleportHint(), getNodeX(), getNodeY() (+5 more)

### Community 46 - "Враги актов 2–3"
Cohesion: 0.21
Nodes (12): Враги актов 2–3 и особенности актов (было → стало), Адская гончая, Банши, Голем, Горгулья, Демон бездны, Костяной колосс, Костяные доспехи (+4 more)

### Community 48 - "Чернокнижник и Тьма"
Cohesion: 0.23
Nodes (12): Card: Бездна (Abyss) +2 per Darkness, Card: Уничтожение (Annihilation), Card: Кровь за кровь (Blood for Blood), Card: Бог крови (Blood God), Card: Печать крови (Blood Seal card), Card: Костяные заплаты — Warlock starter repair, Warlock doc: Darkness for any HP loss (superseded), Warlock cards: было → стало (79 → 67) (+4 more)

### Community 49 - "Враги акта 9"
Cohesion: 0.24
Nodes (10): Падший рыцарь, Акт 9 «Легион мёртвых»: враги, Боевая гончая, Король легиона, Костяной лучник, Костяной таран, Мёртвый генерал, Мёртвый знаменосец (+2 more)

### Community 50 - "Враги акта 7"
Cohesion: 0.23
Nodes (11): Акт 7 «Кузня демонов»: враги, Бес, Демон-кузнец, Жар, Литейный голем, Магмовый элементаль, Надсмотрщик, Огненная суккуба (+3 more)

### Community 52 - "city.js"
Cohesion: 0.07
Nodes (73): DECOR_HOUSES, DECOR_PROPS, FOUNTAIN, POINTS_OF_INTEREST, SERVICE_HOUSES, buyBuilding(), exchangeEssences(), getHeroEquipment() (+65 more)

### Community 53 - "timelineControl.test.ts"
Cohesion: 0.16
Nodes (19): advancePreparation(), busyCells(), cellPrepGain(), finishTact(), hasPendingZero(), heroSchedule(), nextCellFilled(), pickNextAction() (+11 more)

### Community 54 - "Манифест PWA"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, lang, name, orientation, scope (+3 more)

### Community 55 - "tutorial.ts"
Cohesion: 0.20
Nodes (17): createTopBar(), showCombatEnd(), startNewRun(), BATTLE_STEPS, createTutorialBanner(), currentStep(), DUNGEON_STEPS, finishTutorial() (+9 more)

### Community 56 - "getCardData"
Cohesion: 0.15
Nodes (35): actualTarget(), aliveEnemies(), applyHeroRules(), bleed(), bonusEffects(), chainLinks(), checkPhases(), drinkPotion() (+27 more)

### Community 57 - "Враги акта 6"
Cohesion: 0.27
Nodes (9): Акт 6 «Безлунные пещеры»: враги, Глубинный червь, Кромешная тьма, Ледяной дух, Матка теней, Пещерная мышь, Пещерный тролль, Пожиратель света (+1 more)

### Community 58 - "rules.ts"
Cohesion: 0.23
Nodes (11): drawAfterResolve(), getUpcomingDraws(), drawCards(), drawOnResolve(), NumberRule, openDrawCount(), prepEmptyGain(), relicBonus() (+3 more)

### Community 59 - "Таблица баланса: правила для всех чисел игры"
Cohesion: 0.15
Nodes (12): 1. Единица — очко силы (ОС), 2. Бюджет карты, 3. Прайс эффектов, 4. Герои, 5. Модель боя: откуда берутся числа врагов, 6. Награды, 7. Реликвии и зелья, 8. События (+4 more)

### Community 62 - "meta.ts"
Cohesion: 0.11
Nodes (28): BUILDINGS, QUESTS, POTION_PRICE, TRADER_GOODS, ABYSS_ENTRY, applyRunToMeta(), bankLoot(), buryHero() (+20 more)

### Community 63 - "questDialog.js"
Cohesion: 0.45
Nodes (10): claimQuest(), countReadyQuests(), getQuestProgress(), isQuestClaimed(), isQuestReady(), createButton(), createQuest(), onClaim() (+2 more)

### Community 64 - "Враги акта 10"
Cohesion: 0.52
Nodes (7): Акт 10 «Сердце бездны»: враги и финальный босс, Безумие, Вестник безумия, Глаз бездны, Колосс пустоты, Отродье бездны, Сердце бездны

### Community 65 - "Фазы боссов и вампиризм"
Cohesion: 0.33
Nodes (4): Лорд вампиров, Жрец крови, Гидра, Трупоед

### Community 66 - "Враги акта 8"
Cohesion: 0.48
Nodes (7): Акт 8 «Чумной некрополь»: враги, Гниющий великан, Зараза, Некромант, Чумной владыка, Чумной зомби, Чумной лекарь

### Community 70 - "Наклон карт"
Cohesion: 0.80
Nodes (4): enableCardTilt(), onLeave(), onMove(), reset()

### Community 73 - "animationMs"
Cohesion: 0.83
Nodes (4): playSteps(), walkDown(), walkInto(), animationMs()

## Ambiguous Edges - Review These
- `Card upgrades by rarity tiers` → `Upgrades without stars (legendary cap)`  [AMBIGUOUS]
  docs/PLAN.md · relation: conceptually_related_to
- `Combo (Комбо) = current chain length` → `Assassin cards: было → стало (86 → 69)`  [AMBIGUOUS]
  docs/cards/assassin.md · relation: conceptually_related_to
- `Warlock doc: Darkness for any HP loss (superseded)` → `Darkness (Тьма) — only from HP payment and burned cards`  [AMBIGUOUS]
  docs/cards/warlock.md · relation: conceptually_related_to
- `Darkness (Тьма) — only from HP payment and burned cards` → `Warlock class (Чернокнижник) — pays HP, HP 80`  [AMBIGUOUS]
  docs/PLAN.md · relation: conceptually_related_to

## Knowledge Gaps
- **38 isolated node(s):** `#app root rendered by router.js`, `SVG art gradients (art-steel, art-gold, art-ember…)`, `#scene dungeon background layer`, `partThree working branch`, `Verification gate: npm test + typecheck + build` (+33 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 274 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Полный забег акт 1 после выравнивания классов` connect `Замеры баланса акта 1` to `Враги акта 1 и арена`, `sim-run.js`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **What connects `#app root rendered by router.js`, `SVG art gradients (art-steel, art-gold, art-ember…)`, `#scene dungeon background layer` to the rest of the system?**
  _38 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Визуальные эффекты` be split into smaller, more focused modules?**
  _Cohesion score 0.10842844600526778 - nodes in this community are weakly interconnected._
- **Why does `Враги 1 акта, арена и боссы актов 1–3 (было → стало)` connect `Враги акта 1 и арена` to `Враги акта 10`, `Фазы боссов и вампиризм`, `Враги акта 4 и печать`, `Враги акта 8`, `Замеры баланса акта 1`, `Враги актов 2–3`, `Враги акта 9`, `Враги акта 7`, `Враги акта 6`, `Враги акта 5`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Should `card.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06259780907668232 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Card upgrades by rarity tiers` and `Upgrades without stars (legendary cap)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Combo (Комбо) = current chain length` and `Assassin cards: было → стало (86 → 69)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._