# Graph Report - cardDungeonExplorer  (2026-11-10)

## Corpus Check
- 155 files · ~186,206 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .css 7, (none) 2)

## Summary
- 1649 nodes · 5789 edges · 60 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 109 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6e3d7cdc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cardPicker.ts
- bot.js
- Визуальные эффекты
- startWalking
- Замеры баланса акта 1
- cityServices.js
- Экран подземелья
- tutorial.ts
- animations.js
- placeCard
- showScreen
- deck.ts
- План переделки и этапы
- Тесты боя
- timeline.ts
- screens/combat.ts
- save.ts
- Зависимости проекта
- sim.js
- engine/combat.ts
- Маг и статусы
- Разбор механик и события
- Особенности классов
- card.ts
- Воин и броня
- types.ts
- meta.ts
- Алхимик и зелья
- effects.ts
- run.ts
- Враги акта 5
- el
- Генерация карты акта
- Реликвии
- Враги акта 4 и печать
- reward.js
- abyss.ts
- map.test.ts
- sim-merge.js
- Настройки TypeScript
- Бонусы цепочки
- Убийца и Комбо
- Враги акта 1 и арена
- rules.ts
- cardHelpers.ts
- Карта подземелья
- Враги актов 2–3
- Чернокнижник и Тьма
- Враги акта 9
- Враги акта 7
- city.js
- Манифест PWA
- Враги акта 6
- Данные врагов
- Таблица баланса: правила для всех чисел игры
- loadMeta
- Враги акта 10
- Фазы боссов и вампиризм
- Враги акта 8
- Наклон карт

## God Nodes (most connected - your core abstractions)
1. `el()` - 180 edges
2. `showScreen()` - 81 edges
3. `playSound()` - 49 edges
4. `showTooltip()` - 43 edges
5. `loadMeta()` - 39 edges
6. `Починка` - 38 edges
7. `TEXTS` - 34 edges
8. `Сокрушение` - 34 edges
9. `Враги 1 акта, арена и боссы актов 1–3 (было → стало)` - 33 edges
10. `getCardData()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `inBossRoom()` --calls--> `createRun()`  [EXTRACTED]
  tests/abyss.test.ts → js/engine/run.ts
- `damageOf()` --calls--> `getCardData()`  [EXTRACTED]
  tests/levels.test.ts → js/engine/deck.ts
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

## Communities (60 total, 0 thin omitted)

### Community 0 - "cardPicker.ts"
Cohesion: 0.18
Nodes (18): POTIONS, RELICS, addPotionToCombat(), finishEvent(), scaledShards(), saveRun(), RelicData, appendTestTools() (+10 more)

### Community 1 - "bot.js"
Cohesion: 0.38
Nodes (11): applyAction(), canAct(), cloneCombat(), evaluate(), finishOnCopy(), freeStart(), laneEnd(), listActions() (+3 more)

### Community 2 - "Визуальные эффекты"
Cohesion: 0.11
Nodes (67): getAnimationSpeed(), isLiteGraphics(), ARCANE, bolt(), burst(), CARD_VFX, drawFrame(), drawParticle() (+59 more)

### Community 3 - "startWalking"
Cohesion: 0.26
Nodes (12): canWalkStraight(), cellCenter(), cellOf(), clamp(), createFreeCheck(), distance(), findPath(), isDialogOpen() (+4 more)

### Community 4 - "Замеры баланса акта 1"
Cohesion: 0.17
Nodes (44): Эталон сложности акт 1, этаж 0 (400 вариантов), Бот проверяет 400 вариантов за ход, Акт 1 «Катакомбы», Алхимик, Воин, Культист, Маг, Могильный пёс (элита) (+36 more)

### Community 5 - "cityServices.js"
Cohesion: 0.12
Nodes (37): COSMETICS, getMaxPotions(), HEROES, canUpgradeFirstStep(), buyFromTrader(), getBestAct(), getHolder(), isTraderGoodOwned() (+29 more)

### Community 6 - "Экран подземелья"
Cohesion: 0.16
Nodes (29): mergeSeen(), findKnownPath(), fireflyReach(), getAvailableNodeIds(), getLowerNodeIds(), getPreviousNodeId(), getStepCost(), isNodeCleared() (+21 more)

### Community 7 - "tutorial.ts"
Cohesion: 0.25
Nodes (14): showCombatEnd(), BATTLE_STEPS, createTutorialBanner(), currentStep(), DUNGEON_STEPS, finishTutorial(), finishTutorialBattle(), goToNextStep() (+6 more)

### Community 8 - "animations.js"
Cohesion: 0.07
Nodes (72): loadSettings(), saveSettings(), allUnits(), animate(), animateHpBar(), captureCombatView(), castAnimation(), castProjectile() (+64 more)

### Community 9 - "placeCard"
Cohesion: 0.17
Nodes (25): brewCardsInTact(), canAct(), canPlayCard(), checkLane(), checkTarget(), fail(), findFreeStart(), hasStarted() (+17 more)

### Community 10 - "showScreen"
Cohesion: 0.10
Nodes (38): ICON_AUTHORS, MODEL_CREDITS, SOUND_CREDITS, TEXTS, canReturnToCity(), getDeepestFloor(), awardArenaWin(), setMusicMood() (+30 more)

### Community 11 - "deck.ts"
Cohesion: 0.20
Nodes (10): CARDS, canUpgradeFurther(), createCardInstance(), LADDER, Leveled, scaleCard(), SCALED, scaleEffects() (+2 more)

### Community 12 - "План переделки и этапы"
Cohesion: 0.08
Nodes (24): partThree working branch, CLAUDE.md project instructions (Такт клинка), Verification gate: npm test + typecheck + build, Block lasts 6 cells (portions), Difficulty target: ~70% act-1 clear, falling per act, Draw: each fired card brings one new, hand max 10, Enemies, relics, potions, saves impact table, Enemy lanes and move weights (Дорожки врагов) (+16 more)

### Community 13 - "Тесты боя"
Cohesion: 0.13
Nodes (32): ENEMIES, addCardToHand(), advance(), brewBlocksTime(), chooseBrew(), createCombat(), createEnemy(), endTurn() (+24 more)

### Community 14 - "timeline.ts"
Cohesion: 0.12
Nodes (27): ActionPreview, createBadge(), PERCENT_STATUSES, appendTactLines(), createEnemyTrack(), createHeroTrack(), createPrepTrack(), createRow() (+19 more)

### Community 15 - "screens/combat.ts"
Cohesion: 0.08
Nodes (65): cardWeight(), getUpcomingDraws(), getCardData(), createHpBar(), createStatusIcons(), setTimelineProgress(), showLaneSlot(), actionButton() (+57 more)

### Community 16 - "save.ts"
Cohesion: 0.09
Nodes (34): activeSlot, clearRun(), decodeBase64(), DEFAULT_SETTINGS, deleteSlot(), encodeBase64(), exportSave(), hasSave() (+26 more)

### Community 17 - "Зависимости проекта"
Cohesion: 0.09
Nodes (26): devDependencies, playwright-core@^1.65.0, sharp@^0.35.5, @types/node@^26.6.6, typescript@^7.0.2, vite@^8.3.6, vite-plugin-pwa@^2.0.0, vitest@^5.1.0 (+18 more)

### Community 18 - "sim.js"
Cohesion: 0.13
Nodes (9): applyStrengthScale(), args, BEAM, encounters, FIGHTS, FLOOR, results, started (+1 more)

### Community 19 - "engine/combat.ts"
Cohesion: 0.08
Nodes (60): addRelicToCombat(), advancePreparation(), aliveEnemies(), applyHeroRules(), bonusEffects(), busyCells(), cellPrepGain(), chainBonusMet() (+52 more)

### Community 20 - "Маг и статусы"
Cohesion: 0.12
Nodes (22): Card: Походная лаборатория (Field Lab), Mage cards: было → стало (35 → 52), Card: Уголёк (Ember), Card: Ледяная стрела (Ice Arrow) Slow, Card: Инферно (Inferno) weight 5 → 4, Card: Метеор (Meteor) Finale, Card: Перегрузка (Overload) +1 Tide per tact, Card: Пиробласт (Pyroblast) (+14 more)

### Community 21 - "Разбор механик и события"
Cohesion: 0.11
Nodes (24): Events: было → стало (22 events, 7 encounters), Event: Доспехи павшего (Fallen Knight Armor), Event: Зал зеркал (Hall of Mirrors), Event: Старая карта (Old Map), Encounter: Карманник (Pickpocket) steals potion, Event: Мастерская (Workshop), Act features (Трясина, Иней, Жар, Натиск…), Bosses with phases and timeline trick (+16 more)

### Community 22 - "Особенности классов"
Cohesion: 0.22
Nodes (8): Алхимик — зелья в бою, Воин — танк в доспехах, Маг — подготовка заклинаний, Общий каркас колоды, Особенности классов, Убийца — длинные цепочки, Чернокнижник — сила за кровь, Что меняется в движке

### Community 23 - "card.ts"
Cohesion: 0.07
Nodes (61): canUpgradeCard(), chainBonuses(), getCardRarity(), calculateBlock(), calculateDamage(), getBonus(), CardInstance, enemySprite() (+53 more)

### Community 24 - "Воин и броня"
Cohesion: 0.11
Nodes (22): Card: Кислота (Acid) Sunder, Card: Панацея (Panacea) Repair 10, Card: Смола (Resin) — Alchemist starter repair, Card: Подтянуть ремни — Assassin starter repair, Card: Руна защиты — Mage starter repair, Upgrade tiers formula (+20% per tier, round up), Card: Сокрушение (Bash) Sunder 2, Card: Рассечение (Cleave) 8 to all (+14 more)

### Community 25 - "types.ts"
Cohesion: 0.05
Nodes (40): BUILDINGS, EVENTS, TRAVEL_EVENTS, ChainLink, CombatSetup, RunSetup, ActiveEvent, ArenaFight (+32 more)

### Community 26 - "meta.ts"
Cohesion: 0.11
Nodes (31): QUESTS, POTION_PRICE, TRADER_GOODS, ABYSS_ENTRY, applyRunToMeta(), bankLoot(), buryHero(), countVictory() (+23 more)

### Community 27 - "Алхимик и зелья"
Cohesion: 0.12
Nodes (21): Card: Бомба (Bomb) 5 to all, Card: Варка зелья (Brew Potion), Alchemist cards: было → стало (29 → 50), Card: Взрыв эликсира (Elixir Blast), Card: Трансмутация (Transmutation), Zero-weight cards: strict rule, Event: Странные часы (Strange Clock), Alchemist class (Алхимик) — brewing, potions weight 0 (+13 more)

### Community 28 - "effects.ts"
Cohesion: 0.08
Nodes (42): bleed(), freezeTact(), isRareTact(), startTact(), absoluteTime(), absorbBlock(), addBlock(), addTally() (+34 more)

### Community 29 - "run.ts"
Cohesion: 0.07
Nodes (70): upgradeCard(), chooseEventOption(), getEventData(), startEvent(), startTravelEvent(), deriveSeed(), pickRandom(), addCardToDeck() (+62 more)

### Community 30 - "Враги акта 5"
Cohesion: 0.14
Nodes (18): Безликий, Пожиратель разума, Королева ведьм, Призрак, Разбойник, Болотная ведьма, Акт 5 «Цитадель тьмы»: враги, Без передышки (+10 more)

### Community 31 - "el"
Cohesion: 0.17
Nodes (32): getCurrentFloor(), takeFromCache(), getActiveSlot(), createCombatItems(), createIconButton(), createItemColumns(), createItemsRow(), createMenuButton() (+24 more)

### Community 32 - "Генерация карты акта"
Cohesion: 0.24
Nodes (19): addDeadEnds(), assignNodeTypes(), countDistinct(), generateMap(), MapLayout, nodeId(), pickNodeType(), pickRooms() (+11 more)

### Community 33 - "Реликвии"
Cohesion: 0.18
Nodes (16): Card: Некромантия (Necromancy) weight 1, Event: Кузнец в подземелье (Dungeon Blacksmith), Zero-weight cards (Карты весом 0), Relic: Астролябия (Astrolabe) — Mage, prep ×2, Relic: Кровавый алтарь (Blood Altar) — Warlock, Class relics (drop only for own hero), Boss relic: Корона углей (Crown of Embers), Boss relic: Сердце бездны (Heart of the Abyss) Finale twice (+8 more)

### Community 34 - "Враги акта 4 и печать"
Cohesion: 0.18
Nodes (15): Страж бездны, Король-лич, Послушник лича, Акт 4 «Ядовитые топи»: враги и особенность шкалы, Болотная пиявка, Грибник, Железная дисциплина, Иней (+7 more)

### Community 35 - "reward.js"
Cohesion: 0.16
Nodes (19): getActData(), isAbyssAct(), completeReward(), generateActMap(), goToNextAct(), hasConqueredDungeon(), isBossDefeated(), isInDefeatedBossRoom() (+11 more)

### Community 36 - "abyss.ts"
Cohesion: 0.13
Nodes (17): CONFIG, ACTS, buildAbyssAct(), cache, getAbyssCircle(), mergeMechanics(), pickMechanics(), pickSome() (+9 more)

### Community 37 - "map.test.ts"
Cohesion: 0.31
Nodes (6): canStartAct(), getStartableActs(), createRng(), MapNode, Rng, maps

### Community 38 - "sim-merge.js"
Cohesion: 0.14
Nodes (11): args, errors, actNumbers, args, cell(), [dir, ...rest], heroes, lines (+3 more)

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

### Community 43 - "rules.ts"
Cohesion: 0.24
Nodes (10): offerBrew(), brewOptionCount(), canPrepare(), NumberRule, openDrawCount(), relicBonus(), rerollEveryTact(), rerollsPerTact() (+2 more)

### Community 44 - "cardHelpers.ts"
Cohesion: 0.08
Nodes (59): allStatus(), block(), brew(), burn, card(), chained(), cheaperPower(), damage() (+51 more)

### Community 45 - "Карта подземелья"
Cohesion: 0.30
Nodes (14): getAct(), createLine(), createLines(), createMapContent(), createNode(), createSaveHint(), createTeleportHint(), getNodeX() (+6 more)

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
Cohesion: 0.08
Nodes (57): DECOR_HOUSES, DECOR_PROPS, FOUNTAIN, POINTS_OF_INTEREST, SERVICE_HOUSES, buyBuilding(), exchangeEssences(), getTraderGoods() (+49 more)

### Community 54 - "Манифест PWA"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, lang, name, orientation, scope (+3 more)

### Community 57 - "Враги акта 6"
Cohesion: 0.27
Nodes (9): Акт 6 «Безлунные пещеры»: враги, Глубинный червь, Кромешная тьма, Ледяной дух, Матка теней, Пещерная мышь, Пещерный тролль, Пожиратель света (+1 more)

### Community 58 - "Данные врагов"
Cohesion: 0.27
Nodes (7): attack(), buff(), extras(), guard(), MoveOptions, EnemyData, EnemyMove

### Community 59 - "Таблица баланса: правила для всех чисел игры"
Cohesion: 0.15
Nodes (12): 1. Единица — очко силы (ОС), 2. Бюджет карты, 3. Прайс эффектов, 4. Герои, 5. Модель боя: откуда берутся числа врагов, 6. Награды, 7. Реликвии и зелья, 8. События (+4 more)

### Community 62 - "loadMeta"
Cohesion: 0.19
Nodes (20): claimQuest(), countReadyQuests(), getQuestProgress(), isQuestClaimed(), isQuestReady(), getHeroFilter(), loadMeta(), applyHeroLook() (+12 more)

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
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 271 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Полный забег акт 1 после выравнивания классов` connect `Замеры баланса акта 1` to `Враги акта 1 и арена`, `run.ts`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **What connects `#app root rendered by router.js`, `SVG art gradients (art-steel, art-gold, art-ember…)`, `#scene dungeon background layer` to the rest of the system?**
  _38 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Визуальные эффекты` be split into smaller, more focused modules?**
  _Cohesion score 0.10656436487638533 - nodes in this community are weakly interconnected._
- **Why does `Враги 1 акта, арена и боссы актов 1–3 (было → стало)` connect `Враги акта 1 и арена` to `Враги акта 10`, `Фазы боссов и вампиризм`, `Враги акта 4 и печать`, `Враги акта 8`, `Замеры баланса акта 1`, `Враги актов 2–3`, `Враги акта 9`, `Враги акта 7`, `Враги акта 6`, `Враги акта 5`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Should `cityServices.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12179487179487179 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Card upgrades by rarity tiers` and `Upgrades without stars (legendary cap)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Combo (Комбо) = current chain length` and `Assassin cards: было → стало (86 → 69)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._