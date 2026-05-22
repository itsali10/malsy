// Equipment Database
const equipment = {
    glassware: [
        { id: 'beaker', name: 'Beaker', icon: '🥛', category: 'glassware', description: 'Used for mixing, heating, and storing liquids' },
        { id: 'erlenmeyer', name: 'Erlenmeyer Flask', icon: '🧪', category: 'glassware', description: 'Conical flask for mixing and heating' },
        { id: 'volumetric', name: 'Volumetric Flask', icon: '🍶', category: 'glassware', description: 'Precise volume measurement' },
        { id: 'florence', name: 'Florence Flask', icon: '⚗️', category: 'glassware', description: 'Boiling flask with round bottom' },
        { id: 'test_tube', name: 'Test Tube', icon: '🧬', category: 'glassware', description: 'Small tube for reactions' },
        { id: 'graduated_cylinder', name: 'Graduated Cylinder', icon: '📏', category: 'glassware', description: 'Precise volume measurement' },
        { id: 'burette', name: 'Burette', icon: '💧', category: 'glassware', description: 'Precise liquid dispensing' },
        { id: 'pipette', name: 'Pipette', icon: '🔬', category: 'glassware', description: 'Precise liquid transfer' },
        { id: 'watch_glass', name: 'Watch Glass', icon: '🔍', category: 'glassware', description: 'Covering and evaporation' },
        { id: 'evaporating_dish', name: 'Evaporating Dish', icon: '🍽️', category: 'glassware', description: 'Evaporation of solutions' },
        { id: 'crucible', name: 'Crucible', icon: '🔥', category: 'glassware', description: 'High temperature reactions' },
        { id: 'stirring_rod', name: 'Stirring Rod', icon: '🥄', category: 'glassware', description: 'Mixing solutions' },
        { id: 'funnel', name: 'Funnel', icon: '🔻', category: 'glassware', description: 'Liquid transfer and filtration' },
        { id: 'separatory_funnel', name: 'Separatory Funnel', icon: '⏳', category: 'glassware', description: 'Liquid separation' }
    ],
    safety: [
        { id: 'goggles', name: 'Safety Goggles', icon: '🥽', category: 'safety', description: 'Eye protection' },
        { id: 'lab_coat', name: 'Lab Coat', icon: '👔', category: 'safety', description: 'Body protection' },
        { id: 'gloves', name: 'Gloves', icon: '🧤', category: 'safety', description: 'Hand protection' },
        { id: 'fume_hood', name: 'Fume Hood', icon: '💨', category: 'safety', description: 'Ventilation system' },
        { id: 'fire_extinguisher', name: 'Fire Extinguisher', icon: '🧯', category: 'safety', description: 'Fire safety equipment' },
        { id: 'fire_blanket', name: 'Fire Blanket', icon: '🛡️', category: 'safety', description: 'Fire suppression' },
        { id: 'safety_shower', name: 'Safety Shower', icon: '🚿', category: 'safety', description: 'Emergency decontamination' },
        { id: 'eyewash', name: 'Eye Wash Station', icon: '👁️', category: 'safety', description: 'Eye emergency station' },
        { id: 'first_aid', name: 'First Aid Kit', icon: '🏥', category: 'safety', description: 'Medical supplies' }
    ],
    storage: [
        { id: 'reagent_bottle', name: 'Reagent Bottle', icon: '🧴', category: 'storage', description: 'Chemical storage' },
        { id: 'wash_bottle', name: 'Wash Bottle', icon: '💦', category: 'storage', description: 'Distilled water storage' },
        { id: 'desiccator', name: 'Desiccator', icon: '🌡️', category: 'storage', description: 'Moisture-free storage' },
        { id: 'storage_cabinet', name: 'Storage Cabinet', icon: '🗄️', category: 'storage', description: 'Chemical storage' },
        { id: 'gas_cylinder', name: 'Gas Cylinder', icon: '⛽', category: 'storage', description: 'Compressed gas storage' }
    ],
    advanced: [
        { id: 'centrifuge', name: 'Centrifuge', icon: '🌀', category: 'advanced', description: 'Separation by centrifugation' },
        { id: 'spectrophotometer', name: 'Spectrophotometer', icon: '📊', category: 'advanced', description: 'Light absorption analysis' },
        { id: 'chromatography', name: 'Chromatography Column', icon: '📈', category: 'advanced', description: 'Separation technique' },
        { id: 'stirrer', name: 'Magnetic Stirrer', icon: '🔄', category: 'advanced', description: 'Automated mixing' },
        { id: 'condenser', name: 'Reflux Condenser', icon: '❄️', category: 'advanced', description: 'Vapor condensation' },
        { id: 'distillation', name: 'Distillation Apparatus', icon: '⚡', category: 'advanced', description: 'Liquid separation' },
        { id: 'vacuum_pump', name: 'Vacuum Pump', icon: '💨', category: 'advanced', description: 'Pressure reduction' }
    ]
};

// Chemical Database
const chemicals = [
    { id: 'water', name: 'Water', symbol: 'H₂O', icon: '💧', color: '#4FC3F7', description: 'Universal solvent', safety: 'safe', pH: 7 },
    { id: 'hydrochloric', name: 'Hydrochloric Acid', symbol: 'HCl', icon: '⚠️', color: '#FF6B6B', description: 'Strong acid', safety: 'danger', pH: 1 },
    { id: 'sodium_hydroxide', name: 'Sodium Hydroxide', symbol: 'NaOH', icon: '⚗️', color: '#FFD93D', description: 'Strong base', safety: 'danger', pH: 14 },
    { id: 'sodium_chloride', name: 'Sodium Chloride', symbol: 'NaCl', icon: '🧂', color: '#FFFFFF', description: 'Table salt', safety: 'safe', pH: 7 },
    { id: 'copper_sulfate', name: 'Copper Sulfate', symbol: 'CuSO₄', icon: '💎', color: '#2196F3', description: 'Blue compound', safety: 'warning', pH: 4 },
    { id: 'hydrogen_peroxide', name: 'Hydrogen Peroxide', symbol: 'H₂O₂', icon: '💨', color: '#E1F5FE', description: 'Oxidizing agent', safety: 'warning', pH: 6 },
    { id: 'sodium_bicarbonate', name: 'Sodium Bicarbonate', symbol: 'NaHCO₃', icon: '🍞', color: '#FFF9C4', description: 'Baking soda', safety: 'safe', pH: 8 },
    { id: 'vinegar', name: 'Acetic Acid', symbol: 'CH₃COOH', icon: '🍶', color: '#F5F5F5', description: 'Weak acid', safety: 'safe', pH: 3 },
    { id: 'calcium_chloride', name: 'Calcium Chloride', symbol: 'CaCl₂', icon: '🧊', color: '#E0E0E0', description: 'Salt compound', safety: 'safe', pH: 7 },
    { id: 'ammonia', name: 'Ammonia', symbol: 'NH₃', icon: '☁️', color: '#E3F2FD', description: 'Weak base', safety: 'warning', pH: 11 },
    { id: 'sulfuric_acid', name: 'Sulfuric Acid', symbol: 'H₂SO₄', icon: '🔥', color: '#FF4444', description: 'Strong acid', safety: 'danger', pH: 0 },
    { id: 'nitric_acid', name: 'Nitric Acid', symbol: 'HNO₃', icon: '💣', color: '#FF6666', description: 'Strong acid', safety: 'danger', pH: 1 },
    { id: 'potassium_permanganate', name: 'Potassium Permanganate', symbol: 'KMnO₄', icon: '💜', color: '#9C27B0', description: 'Oxidizing agent', safety: 'warning', pH: 7 },
    { id: 'sodium_carbonate', name: 'Sodium Carbonate', symbol: 'Na₂CO₃', icon: '⚪', color: '#FFFFFF', description: 'Washing soda', safety: 'safe', pH: 11 },
    { id: 'magnesium', name: 'Magnesium', symbol: 'Mg', icon: '✨', color: '#C0C0C0', description: 'Silver metal, burns brightly', safety: 'warning', pH: 7 },
    { id: 'oxygen', name: 'Oxygen', symbol: 'O₂', icon: '💨', color: '#E3F2FD', description: 'Gas, supports combustion', safety: 'safe', pH: 7 },
    { id: 'magnesium_oxide', name: 'Magnesium Oxide', symbol: 'MgO', icon: '⚪', color: '#FFFFFF', description: 'White powder', safety: 'safe', pH: 7 },
    { id: 'iron', name: 'Iron', symbol: 'Fe', icon: '🔩', color: '#8B7355', description: 'Metal, can rust', safety: 'safe', pH: 7 },
    { id: 'rust', name: 'Iron Hydroxide (Rust)', symbol: 'Fe(OH)₃', icon: '🟤', color: '#8B4513', description: 'Rust, reddish-brown', safety: 'safe', pH: 7 },
    { id: 'zinc', name: 'Zinc', symbol: 'Zn', icon: '⚙️', color: '#D3D3D3', description: 'Metal, reacts with acid', safety: 'safe', pH: 7 },
    { id: 'hydrogen', name: 'Hydrogen Gas', symbol: 'H₂', icon: '💨', color: '#E1F5FE', description: 'Light gas', safety: 'warning', pH: 7 },
    { id: 'zinc_chloride', name: 'Zinc Chloride', symbol: 'ZnCl₂', icon: '🧪', color: '#F5F5F5', description: 'Salt formed', safety: 'safe', pH: 7 },
    { id: 'silver_nitrate', name: 'Silver Nitrate', symbol: 'AgNO₃', icon: '💎', color: '#FFFFFF', description: 'Clear solution', safety: 'warning', pH: 7 },
    { id: 'silver_chloride', name: 'Silver Chloride', symbol: 'AgCl', icon: '⬜', color: '#FFFFFF', description: 'White precipitate', safety: 'safe', pH: 7 },
    { id: 'sodium_nitrate', name: 'Sodium Nitrate', symbol: 'NaNO₃', icon: '🧂', color: '#FFFFFF', description: 'Clear solution', safety: 'safe', pH: 7 }
];

// Chemical Equations Database
const chemicalEquations = [
    {
        reactants: ['hydrochloric', 'sodium_hydroxide'],
        equation: 'HCl + NaOH → NaCl + H₂O',
        name: 'Neutralization Reaction',
        description: 'Acid and base react to form salt and water. This is an exothermic reaction.',
        type: 'neutralization'
    },
    {
        reactants: ['hydrochloric', 'sodium_bicarbonate'],
        equation: 'HCl + NaHCO₃ → NaCl + H₂O + CO₂',
        name: 'Acid-Base Reaction',
        description: 'Produces carbon dioxide gas, water, and salt. Observe bubbles forming!',
        type: 'gas_evolution'
    },
    {
        reactants: ['vinegar', 'sodium_bicarbonate'],
        equation: 'CH₃COOH + NaHCO₃ → CH₃COONa + H₂O + CO₂',
        name: 'Baking Soda and Vinegar',
        description: 'Classic reaction producing carbon dioxide bubbles. Safe and fun!',
        type: 'gas_evolution'
    },
    {
        reactants: ['copper_sulfate', 'sodium_hydroxide'],
        equation: 'CuSO₄ + 2NaOH → Cu(OH)₂ + Na₂SO₄',
        name: 'Precipitation Reaction',
        description: 'Forms blue copper hydroxide precipitate. The solid sinks to the bottom.',
        type: 'precipitation'
    },
    {
        reactants: ['ammonia', 'hydrochloric'],
        equation: 'NH₃ + HCl → NH₄Cl',
        name: 'Formation of Ammonium Chloride',
        description: 'Forms white smoke/clouds of ammonium chloride. Use in fume hood!',
        type: 'gas_formation'
    },
    {
        reactants: ['sulfuric_acid', 'sodium_hydroxide'],
        equation: 'H₂SO₄ + 2NaOH → Na₂SO₄ + 2H₂O',
        name: 'Sulfuric Acid Neutralization',
        description: 'Strong acid-base reaction. Very exothermic - be careful!',
        type: 'neutralization'
    },
    {
        reactants: ['hydrogen_peroxide', 'potassium_permanganate'],
        equation: '2KMnO₄ + 3H₂O₂ → 2MnO₂ + 2KOH + 2H₂O + 3O₂',
        name: 'Oxidation Reaction',
        description: 'Produces oxygen gas. Observe vigorous bubbling!',
        type: 'oxidation'
    },
    {
        reactants: ['calcium_chloride', 'sodium_carbonate'],
        equation: 'CaCl₂ + Na₂CO₃ → CaCO₃ + 2NaCl',
        name: 'Precipitation of Calcium Carbonate',
        description: 'Forms white calcium carbonate precipitate (chalk).',
        type: 'precipitation'
    },
    {
        reactants: ['magnesium', 'oxygen'],
        equation: '2Mg + O₂ → 2MgO',
        name: 'Burning of Magnesium',
        description: 'Magnesium burns with bright white light, forming white powder (magnesium oxide).',
        type: 'combustion',
        specialEffect: 'magnesium_flash',
        productColor: '#FFFFFF' // White powder
    },
    {
        reactants: ['vinegar', 'sodium_bicarbonate'],
        equation: 'NaHCO₃ + CH₃COOH → CO₂ + H₂O + CH₃COONa',
        name: 'Vinegar + Baking Soda',
        description: 'Acid-base reaction producing lots of carbon dioxide bubbles!',
        type: 'gas_evolution',
        specialEffect: 'vigorous_bubbles',
        productColor: '#F5F5F5' // Clear with bubbles (sodium acetate solution)
    },
    {
        reactants: ['iron', 'oxygen', 'water'],
        equation: '4Fe + 3O₂ + 6H₂O → 4Fe(OH)₃',
        name: 'Rusting of Iron',
        description: 'Iron reacts with oxygen and water to form rust (reddish-brown).',
        type: 'oxidation',
        specialEffect: 'rusting',
        productColor: '#8B4513' // Brown rust color
    },
    {
        reactants: ['hydrochloric', 'sodium_hydroxide'],
        equation: 'HCl + NaOH → NaCl + H₂O',
        name: 'Neutralization Reaction',
        description: 'Acid and base cancel each other, forming salt and water. The solution becomes clear!',
        type: 'neutralization',
        specialEffect: 'color_neutralization',
        productColor: '#E3F2FD' // Clear/colorless (salt water)
    },
    {
        reactants: ['hydrogen_peroxide'],
        equation: '2H₂O₂ → 2H₂O + O₂',
        name: 'Decomposition of Hydrogen Peroxide',
        description: 'Hydrogen peroxide breaks down rapidly, releasing oxygen gas bubbles!',
        type: 'decomposition',
        specialEffect: 'rapid_bubbles'
    },
    {
        reactants: ['zinc', 'hydrochloric'],
        equation: 'Zn + 2HCl → ZnCl₂ + H₂',
        name: 'Zinc + Hydrochloric Acid',
        description: 'Zinc reacts with acid, producing hydrogen gas bubbles on metal surface.',
        type: 'metal_acid',
        specialEffect: 'metal_bubbles'
    },
    {
        reactants: ['silver_nitrate', 'sodium_chloride'],
        equation: 'AgNO₃ + NaCl → AgCl ↓ + NaNO₃',
        name: 'Precipitation of Silver Chloride',
        description: 'Two clear liquids mix, white solid (precipitate) suddenly appears and falls down!',
        type: 'precipitation',
        specialEffect: 'sudden_precipitate',
        productColor: '#FFFFFF' // White precipitate
    }
];

// Game State
let selectedEquipment = null;
let placedEquipment = [];
let selectedChemicals = [];
let currentReaction = null;
let selectedReactionForSuggestion = null;

// Component Suggestions for Reactions
const reactionComponents = {
    'magnesium_oxygen': ['beaker', 'test_tube', 'goggles', 'tongs'],
    'vinegar_baking_soda': ['beaker', 'erlenmeyer', 'stirring_rod'],
    'rusting_iron': ['beaker', 'test_tube', 'water'],
    'neutralization': ['beaker', 'erlenmeyer', 'stirring_rod', 'goggles'],
    'hydrogen_peroxide_decomp': ['beaker', 'test_tube'],
    'zinc_acid': ['beaker', 'test_tube', 'goggles'],
    'precipitation': ['beaker', 'test_tube', 'stirring_rod'],
    'copper_sulfate_naoh': ['beaker', 'test_tube', 'stirring_rod'],
    'ammonia_hcl': ['beaker', 'fume_hood', 'goggles']
};

// DOM Elements
let equipmentList, safetyList, storageList, advancedList, chemicalList, reactionsList;
let workbench, reactionLog, safetyStatus, statusIndicator, safetyMessage;
let equipmentModal, equationModal;
let tabButtons;
let suggestionsPanel, suggestedComponents;
let aiAvatar, avatarContainer, speechBubble, speechContent;

// AI Avatar Instance
let drSarah; // Chemistry teacher (Dr. Sarah)

// Initialize
function init() {
    try {
        // Get DOM elements
        equipmentList = document.getElementById('equipmentList');
        safetyList = document.getElementById('safetyList');
        storageList = document.getElementById('storageList');
        advancedList = document.getElementById('advancedList');
        chemicalList = document.getElementById('chemicalList');
        workbench = document.getElementById('workbench');
        reactionLog = document.getElementById('reactionLog');
        safetyStatus = document.getElementById('safetyStatus');
        statusIndicator = document.getElementById('statusIndicator');
        safetyMessage = document.getElementById('safetyMessage');
        equipmentModal = document.getElementById('equipmentModal');
        equationModal = document.getElementById('equationModal');
        tabButtons = document.querySelectorAll('.tab-btn');
        reactionsList = document.getElementById('reactionsList');
        suggestionsPanel = document.getElementById('suggestionsPanel');
        suggestedComponents = document.getElementById('suggestedComponents');
        aiAvatar = document.getElementById('aiAvatar');
        avatarContainer = document.getElementById('aiAvatarContainer');
        speechBubble = document.getElementById('avatarSpeechBubble');
        speechContent = document.getElementById('speechContent');
        
        // Initialize AI Avatar (will be initialized after AIAvatar class loads)

        if (!equipmentList) {
            console.error('Equipment list element not found');
            return;
        }
        
        if (!workbench) {
            console.error('Workbench element not found');
            return;
        }
        
        if (!reactionLog) {
            console.error('Reaction log element not found');
            return;
        }

        // Ensure workbench surface exists
        let surface = workbench.querySelector('.workbench-surface');
        if (!surface) {
            surface = document.createElement('div');
            surface.className = 'workbench-surface';
            workbench.appendChild(surface);
        }
        
        renderReactions();
        renderEquipment();
        renderChemicals();
        setupTabs();
        setupEventListeners();
        
        // Initialize avatar after a short delay to ensure AIAvatar class is loaded
        setTimeout(() => {
            if (typeof AIAvatar !== 'undefined') {
                drSarah = new AIAvatar();
                drSarah.name = "Dr. Sarah";
                initializeAvatar();
            }
        }, 100);
        
        addLogEntry('Virtual Chemistry Lab initialized. Select a reaction to begin!', 'success');
        console.log('Virtual Chemistry Lab initialized successfully');
        console.log('Workbench:', workbench);
        console.log('Equipment list:', equipmentList);
    } catch (error) {
        console.error('Error initializing lab:', error);
        alert('Error loading the chemistry lab: ' + error.message);
    }
}

// Setup Tabs
function setupTabs() {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // Update active tab button
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update active tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(tabName + 'Tab').classList.add('active');
        });
    });
}

// Render Reactions
function renderReactions() {
    if (!reactionsList) return;
    
    reactionsList.innerHTML = chemicalEquations.map((reaction, index) => {
        const reactionKey = getReactionKey(reaction);
        return `
            <div class="reaction-item" data-index="${index}" data-key="${reactionKey}">
                <div class="reaction-icon">🧪</div>
                <div class="reaction-info">
                    <div class="reaction-name">${reaction.name}</div>
                    <div class="reaction-equation">${reaction.equation}</div>
                </div>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    document.querySelectorAll('.reaction-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            selectReaction(index);
        });
    });
}

// Get reaction key for component suggestions
function getReactionKey(reaction) {
    const reactants = reaction.reactants.sort().join('_');
    if (reactants.includes('magnesium') && reactants.includes('oxygen')) return 'magnesium_oxygen';
    if (reactants.includes('vinegar') && reactants.includes('sodium_bicarbonate')) return 'vinegar_baking_soda';
    if (reactants.includes('iron') && reactants.includes('oxygen')) return 'rusting_iron';
    if (reactants.includes('hydrochloric') && reactants.includes('sodium_hydroxide')) return 'neutralization';
    if (reactants.includes('hydrogen_peroxide') && reactants.length === 1) return 'hydrogen_peroxide_decomp';
    if (reactants.includes('zinc') && reactants.includes('hydrochloric')) return 'zinc_acid';
    if (reactants.includes('silver_nitrate') || reactants.includes('copper_sulfate')) return 'precipitation';
    if (reactants.includes('ammonia') && reactants.includes('hydrochloric')) return 'ammonia_hcl';
    return 'default';
}

// Initialize Avatar
function initializeAvatar() {
    if (!drSarah || !speechContent) return;
    
    // Show welcome message from Dr. Sarah
    setTimeout(() => {
        avatarSpeak(drSarah.getEncouragement('first_time'), 'happy');
    }, 1000);
}

// Avatar Speak Function (Dr. Sarah)
function avatarSpeak(text, mood = 'happy', delay = 0) {
    if (!speechContent || !aiAvatar) return;
    
    setTimeout(() => {
        // Update avatar mood
        aiAvatar.className = `ai-avatar ${mood}`;
        
        // Update speech bubble
        if (typeof text === 'string') {
            speechContent.innerHTML = `<p>${text}</p>`;
        } else if (Array.isArray(text)) {
            speechContent.innerHTML = text.map(t => `<p>${t}</p>`).join('');
        } else {
            speechContent.innerHTML = `<p>${text}</p>`;
        }
        
        // Show speech bubble with animation
        if (speechBubble) {
            speechBubble.style.display = 'block';
            speechBubble.style.animation = 'speech-pop 0.3s ease-out';
        }
    }, delay);
}

// Select Reaction
function selectReaction(index) {
    const reaction = chemicalEquations[index];
    selectedReactionForSuggestion = reaction;
    
    // Update visual selection
    document.querySelectorAll('.reaction-item').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`[data-index="${index}"]`).classList.add('selected');
    
    // Show component suggestions
    showComponentSuggestions(reaction);
    
    // Dr. Sarah provides step-by-step guidance
    if (drSarah) {
        const steps = drSarah.getReactionSteps(reaction);
        const firstStep = steps[0];
        
        avatarSpeak([
            firstStep.text,
            "I'll guide you through each step! Follow my instructions carefully. 👩‍🔬"
        ], 'excited');
        
        // Store current reaction steps for guidance
        window.currentReactionSteps = steps;
        window.currentStepIndex = 0;
    }
    
    addLogEntry(`Selected reaction: ${reaction.name}. Suggested components are shown above the workbench.`, 'info');
}

// Show Component Suggestions
function showComponentSuggestions(reaction) {
    if (!suggestionsPanel || !suggestedComponents) return;
    
    const reactionKey = getReactionKey(reaction);
    const suggested = reactionComponents[reactionKey] || ['beaker', 'test_tube'];
    
    suggestedComponents.innerHTML = suggested.map(compId => {
        // Find equipment data
        let compData = equipment.glassware.find(e => e.id === compId) ||
                      equipment.safety.find(e => e.id === compId) ||
                      equipment.storage.find(e => e.id === compId) ||
                      equipment.advanced.find(e => e.id === compId);
        
        if (!compData) {
            // Handle special cases
            if (compId === 'tongs') compData = { id: 'tongs', name: 'Tongs', icon: '🔧', category: 'safety' };
            else compData = { id: compId, name: compId, icon: '🧪', category: 'glassware' };
        }
        
        // Use SVG if available, otherwise use icon
        const svg = typeof getEquipmentSVG !== 'undefined' ? getEquipmentSVG(compId) : '';
        const displayIcon = svg ? `<div class="equipment-svg">${svg}</div>` : `<span class="equipment-icon">${compData.icon}</span>`;
        
        return `
            <div class="suggested-component" data-id="${compId}" draggable="true">
                ${displayIcon}
                <span class="component-name">${compData.name}</span>
            </div>
        `;
    }).join('');
    
    suggestionsPanel.style.display = 'block';
    
    // Make suggested components draggable
    document.querySelectorAll('.suggested-component').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            const compId = item.dataset.id;
            e.dataTransfer.setData('equipmentId', compId);
            e.dataTransfer.setData('category', 'glassware'); // Default, could be improved
            e.dataTransfer.effectAllowed = 'copy';
        });
    });
}

// Render Equipment
function renderEquipment() {
    if (!equipmentList) return;

    // Render glassware with SVG
    equipmentList.innerHTML = equipment.glassware.map(item => {
        const svg = typeof getEquipmentSVG !== 'undefined' ? getEquipmentSVG(item.id) : '';
        const displayIcon = svg ? `<div class="equipment-svg">${svg}</div>` : `<span class="equipment-icon">${item.icon}</span>`;
        
        return `
            <div class="equipment-item" data-id="${item.id}" data-category="${item.category}">
                ${displayIcon}
                <span class="equipment-name">${item.name}</span>
            </div>
        `;
    }).join('');

    // Render safety equipment
    if (safetyList) {
        safetyList.innerHTML = equipment.safety.map(item => `
            <div class="equipment-item" data-id="${item.id}" data-category="${item.category}">
                <span class="equipment-icon">${item.icon}</span>
                <span class="equipment-name">${item.name}</span>
            </div>
        `).join('');
    }

    // Render storage
    if (storageList) {
        storageList.innerHTML = equipment.storage.map(item => `
            <div class="equipment-item" data-id="${item.id}" data-category="${item.category}">
                <span class="equipment-icon">${item.icon}</span>
                <span class="equipment-name">${item.name}</span>
            </div>
        `).join('');
    }

    // Render advanced
    if (advancedList) {
        advancedList.innerHTML = equipment.advanced.map(item => `
            <div class="equipment-item" data-id="${item.id}" data-category="${item.category}">
                <span class="equipment-icon">${item.icon}</span>
                <span class="equipment-name">${item.name}</span>
            </div>
        `).join('');
    }

    // Add drag and drop handlers
    document.querySelectorAll('.equipment-item').forEach(item => {
        // Make draggable
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
            const equipmentId = item.dataset.id;
            const category = item.dataset.category;
            e.dataTransfer.setData('equipmentId', equipmentId);
            e.dataTransfer.setData('category', category);
            e.dataTransfer.effectAllowed = 'copy';
            item.style.opacity = '0.5';
        });
        
        item.addEventListener('dragend', (e) => {
            item.style.opacity = '1';
        });
        
        // Keep click for info
        item.addEventListener('click', () => {
            const equipmentId = item.dataset.id;
            const category = item.dataset.category;
            selectEquipment(equipmentId, category);
        });
    });
}

// Select Equipment
function selectEquipment(equipmentId, category) {
    selectedEquipment = { id: equipmentId, category };
    
    // Update visual selection
    document.querySelectorAll('.equipment-item').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`[data-id="${equipmentId}"]`).classList.add('selected');
    
    // Get equipment info
    let equipmentData = null;
    if (category === 'glassware') equipmentData = equipment.glassware.find(e => e.id === equipmentId);
    else if (category === 'safety') equipmentData = equipment.safety.find(e => e.id === equipmentId);
    else if (category === 'storage') equipmentData = equipment.storage.find(e => e.id === equipmentId);
    else if (category === 'advanced') equipmentData = equipment.advanced.find(e => e.id === equipmentId);
    
    if (equipmentData) {
        addLogEntry(`Selected: ${equipmentData.name}. Click on workbench to place it.`, 'info');
        
        // Show info modal
        showEquipmentInfo(equipmentData);
    }
    
    // Enable workbench clicking
    workbench.style.cursor = 'crosshair';
}

// Place Equipment on Workbench
function placeEquipmentOnWorkbench(equipmentId, category, x, y) {
    if (!workbench) {
        addLogEntry('Workbench not found!', 'warning');
        return;
    }
    
    // Get equipment data
    let equipmentData = null;
    if (category === 'glassware') {
        equipmentData = equipment.glassware.find(e => e.id === equipmentId);
    } else if (category === 'safety') {
        equipmentData = equipment.safety.find(e => e.id === equipmentId);
    } else if (category === 'storage') {
        equipmentData = equipment.storage.find(e => e.id === equipmentId);
    } else if (category === 'advanced') {
        equipmentData = equipment.advanced.find(e => e.id === equipmentId);
    }
    
    if (!equipmentData) return;
    
    const rect = workbench.getBoundingClientRect();
    
    // Create placed equipment element
    const placed = document.createElement('div');
    placed.className = 'placed-equipment';
    placed.style.left = `${Math.max(0, Math.min(x, rect.width - 80))}px`;
    placed.style.top = `${Math.max(0, Math.min(y, rect.height - 80))}px`;
    placed.dataset.equipmentId = equipmentId;
    placed.dataset.category = category;
    
    // Check if it's glassware for transparent styling
    const isGlassware = category === 'glassware';
    const glasswareClass = isGlassware ? 'glassware-transparent' : '';
    
    // Use SVG if available for glassware, otherwise use icon
    let displayContent = '';
    if (isGlassware && typeof getEquipmentSVG !== 'undefined') {
        const svg = getEquipmentSVG(equipmentId);
        displayContent = `<div class="equipment-svg">${svg}</div>`;
    } else {
        displayContent = `<span class="icon">${equipmentData.icon}</span>`;
    }
    
    placed.innerHTML = `
        <div class="equipment-visual ${glasswareClass}">
            ${displayContent}
            <span class="label">${equipmentData.name}</span>
            <div class="liquid" style="height: 0%; opacity: 0;"></div>
            <div class="reaction-effect"></div>
            <div class="bubbles-container"></div>
            <div class="smoke-container"></div>
            <div class="sparks-container"></div>
        </div>
    `;
    
    // Add click handler for selecting placed equipment
    placed.addEventListener('click', (e) => {
        e.stopPropagation();
        selectPlacedEquipment(placed);
        
        // Dr. Sarah guidance when equipment is selected
        if (drSarah && window.currentReactionSteps) {
            const selectStep = window.currentReactionSteps.find(s => s.action === 'select_equipment');
            if (selectStep) {
                setTimeout(() => {
                    avatarSpeak(selectStep.text, 'happy');
                    window.currentStepIndex = selectStep.step - 1;
                }, 300);
            }
        }
    });
    
    // Add drag functionality
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    placed.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(placed.style.left);
        startTop = parseInt(placed.style.top);
        placed.style.zIndex = '100';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = workbench.getBoundingClientRect();
        const newX = startLeft + (e.clientX - startX);
        const newY = startTop + (e.clientY - startY);
        placed.style.left = `${Math.max(0, Math.min(newX, rect.width - 80))}px`;
        placed.style.top = `${Math.max(0, Math.min(newY, rect.height - 80))}px`;
    });
    
    document.addEventListener('mouseup', () => {
        isDragging = false;
        placed.style.zIndex = '10';
    });
    
    const surface = workbench.querySelector('.workbench-surface');
    if (!surface) {
        console.error('Workbench surface not found');
        return;
    }
    surface.appendChild(placed);
    placedEquipment.push({ element: placed, data: equipmentData });
    
    addLogEntry(`Placed ${equipmentData.name} on workbench`, 'success');
    
    // Dr. Sarah guidance when equipment is placed
    if (drSarah && window.currentReactionSteps) {
        const equipmentStep = window.currentReactionSteps.find(s => s.action === 'get_equipment');
        if (equipmentStep && equipmentStep.equipment && equipmentStep.equipment.length > 1) {
            // Check if more equipment needed
            const placedCount = placedEquipment.length;
            const neededCount = equipmentStep.equipment.length;
            if (placedCount < neededCount) {
                setTimeout(() => {
                    avatarSpeak(`Good! You placed the ${equipmentData.name}. ${neededCount - placedCount > 1 ? `You still need ${neededCount - placedCount} more items.` : 'Now click on it to select it!'}`, 'happy');
                }, 500);
            } else {
                const selectStep = window.currentReactionSteps.find(s => s.action === 'select_equipment');
                if (selectStep) {
                    setTimeout(() => {
                        avatarSpeak(selectStep.text, 'happy');
                        window.currentStepIndex = selectStep.step - 1;
                    }, 500);
                }
            }
        } else {
            const selectStep = window.currentReactionSteps.find(s => s.action === 'select_equipment');
            if (selectStep) {
                setTimeout(() => {
                    avatarSpeak(selectStep.text, 'happy');
                    window.currentStepIndex = selectStep.step - 1;
                }, 500);
            }
        }
    }
    
    // Clear selection
    selectedEquipment = null;
    if (workbench) {
        workbench.style.cursor = 'default';
    }
    document.querySelectorAll('.equipment-item').forEach(item => {
        item.classList.remove('selected');
    });
}

// Select Placed Equipment
function selectPlacedEquipment(element) {
    document.querySelectorAll('.placed-equipment').forEach(e => {
        e.classList.remove('selected');
    });
    element.classList.add('selected');
}

// Render Chemicals
function renderChemicals() {
    if (!chemicalList) return;
    renderChemicalList(chemicals);
    setupChemicalSearch();
}

// Render Chemical List (with filtering)
function renderChemicalList(chemicalsToShow) {
    if (!chemicalList) return;
    chemicalList.innerHTML = chemicalsToShow.map(chemical => `
        <div class="chemical-item" data-id="${chemical.id}" data-name="${chemical.name.toLowerCase()}" data-symbol="${chemical.symbol.toLowerCase()}">
            <span class="chemical-icon">${chemical.icon}</span>
            <div class="chemical-name">${chemical.name}</div>
            <div class="chemical-symbol">${chemical.symbol}</div>
        </div>
    `).join('');
    
    document.querySelectorAll('.chemical-item').forEach(item => {
        item.addEventListener('click', () => {
            const chemicalId = item.dataset.id;
            addChemicalToEquipment(chemicalId);
        });
    });
}

// Setup Chemical Search
function setupChemicalSearch() {
    const searchInput = document.getElementById('chemicalSearch');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            renderChemicalList(chemicals);
            return;
        }
        
        const filtered = chemicals.filter(chemical => 
            chemical.name.toLowerCase().includes(searchTerm) ||
            chemical.symbol.toLowerCase().includes(searchTerm) ||
            chemical.description.toLowerCase().includes(searchTerm)
        );
        
        renderChemicalList(filtered);
        
        if (filtered.length === 0) {
            chemicalList.innerHTML = `<p class="no-results">No chemicals found matching "${searchTerm}"</p>`;
        }
    });
}

// Get Real Reaction Color
function getReactionColor(reaction) {
    // Use product color if specified
    if (reaction.productColor) {
        return reaction.productColor;
    }
    
    // Real chemistry colors based on actual reaction products
    const reactionColors = {
        'neutralization': '#E3F2FD', // Clear/colorless (salt water)
        'precipitation': {
            'copper_sulfate_sodium_hydroxide': '#1976D2', // Blue Cu(OH)2
            'silver_nitrate_sodium_chloride': '#FFFFFF', // White AgCl
            'default': '#E0E0E0' // Gray/white precipitate
        },
        'combustion': '#FFFFFF', // White powder (MgO)
        'gas_evolution': '#F5F5F5', // Clear with bubbles
        'oxidation': '#8B4513', // Brown rust
        'decomposition': '#E1F5FE', // Clear (water + oxygen)
        'metal_acid': '#F5F5F5', // Clear solution
        'gas_formation': '#E0E0E0' // White smoke/clouds
    };
    
    // Check for specific reaction
    const reactants = reaction.reactants.sort().join('_');
    if (reaction.type === 'precipitation') {
        if (reactants.includes('copper_sulfate') && reactants.includes('sodium_hydroxide')) {
            return '#1976D2'; // Blue
        }
        if (reactants.includes('silver_nitrate')) {
            return '#FFFFFF'; // White
        }
        return '#E0E0E0'; // Gray/white
    }
    
    return reactionColors[reaction.type] || '#E3F2FD';
}

// Update SVG Liquid
function updateSVGLiquid(svgElement, color, heightPercent) {
    if (!svgElement) return;
    
    // Find or create liquid rect in SVG
    let liquidRect = svgElement.querySelector('#svgLiquid');
    
    if (!liquidRect) {
        // Create liquid rect
        const svgNS = "http://www.w3.org/2000/svg";
        liquidRect = document.createElementNS(svgNS, "rect");
        liquidRect.setAttribute('id', 'svgLiquid');
        liquidRect.setAttribute('x', '30');
        liquidRect.setAttribute('width', '40');
        liquidRect.setAttribute('fill', color);
        liquidRect.setAttribute('opacity', '0.9');
        liquidRect.setAttribute('rx', '2');
        svgElement.appendChild(liquidRect);
    }
    
    // Calculate height based on percentage
    const svgHeight = 120; // viewBox height
    const liquidHeight = (svgHeight * heightPercent) / 100;
    const yPosition = svgHeight - liquidHeight;
    
    liquidRect.setAttribute('y', yPosition.toString());
    liquidRect.setAttribute('height', liquidHeight.toString());
    liquidRect.setAttribute('fill', color);
    liquidRect.setAttribute('opacity', '0.9');
    
    // Add surface highlight
    let surfaceLine = svgElement.querySelector('#svgLiquidSurface');
    if (!surfaceLine) {
        const svgNS = "http://www.w3.org/2000/svg";
        surfaceLine = document.createElementNS(svgNS, "line");
        surfaceLine.setAttribute('id', 'svgLiquidSurface');
        surfaceLine.setAttribute('stroke', 'rgba(255, 255, 255, 0.8)');
        surfaceLine.setAttribute('stroke-width', '2');
        svgElement.appendChild(surfaceLine);
    }
    surfaceLine.setAttribute('x1', '30');
    surfaceLine.setAttribute('x2', '70');
    surfaceLine.setAttribute('y1', yPosition.toString());
    surfaceLine.setAttribute('y2', yPosition.toString());
}

// Add Chemical to Selected Equipment
function addChemicalToEquipment(chemicalId) {
    const selectedPlaced = document.querySelector('.placed-equipment.selected');
    if (!selectedPlaced) {
        addLogEntry('Please select an equipment on the workbench first!', 'warning');
        // Dr. Sarah gives hint
        if (drSarah) {
            avatarSpeak(drSarah.getHint('no_equipment').text, 'happy');
        }
        return;
    }
    
    const chemical = chemicals.find(c => c.id === chemicalId);
    if (!chemical) {
        console.error('Chemical not found:', chemicalId);
        return;
    }
    
    const liquidDiv = selectedPlaced.querySelector('.liquid');
    if (!liquidDiv) {
        console.error('Liquid div not found! Equipment:', selectedPlaced);
        addLogEntry('Error: This equipment cannot hold liquids. Try using a beaker or flask!', 'warning');
        return;
    }
    
    // Increase liquid level or set initial
    const currentHeight = liquidDiv.style.height || '0%';
    const currentHeightNum = parseInt(currentHeight) || 0;
    const newHeight = Math.min(currentHeightNum + 30, 85);
    
    // Set liquid properties - use setAttribute to ensure styles are applied
    const isGlassware = selectedPlaced.dataset.category === 'glassware';
    
    liquidDiv.style.cssText = `
        position: absolute !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        width: 100% !important;
        height: ${newHeight}% !important;
        background-color: ${chemical.color} !important;
        opacity: ${isGlassware ? '0.95' : '0.9'} !important;
        transition: all 0.5s ease !important;
        display: block !important;
        visibility: visible !important;
        border-radius: 0 0 5px 5px !important;
        border-top: ${isGlassware ? '3px' : '2px'} solid rgba(255, 255, 255, 0.8) !important;
        z-index: 2 !important;
    `;
    
    // Update SVG liquid if it's a beaker/flask
    const svgElement = selectedPlaced.querySelector('.equipment-svg svg');
    if (svgElement && isGlassware) {
        updateSVGLiquid(svgElement, chemical.color, newHeight);
    }
    
    // Store color for gradient overlay
    liquidDiv.setAttribute('data-liquid-color', chemical.color);
    
    console.log(`✅ Added ${chemical.name}: Height=${newHeight}%, Color=${chemical.color}`);
    
    // Check if this equipment already has chemicals
    if (!selectedPlaced.dataset.chemicals) {
        selectedPlaced.dataset.chemicals = chemicalId;
    } else {
        // Multiple chemicals - check for reactions
        const existingChemicals = selectedPlaced.dataset.chemicals.split(',');
        if (!existingChemicals.includes(chemicalId)) {
            existingChemicals.push(chemicalId);
            selectedPlaced.dataset.chemicals = existingChemicals.join(',');
            
            // Mix colors for visual effect
            mixChemicalColors(selectedPlaced, existingChemicals);
            
            // Check for chemical equation after a short delay to ensure liquid is visible
            setTimeout(() => {
                checkForEquation(existingChemicals);
            }, 500);
        }
    }
    
    addLogEntry(`Added ${chemical.name} (${chemical.symbol}) to equipment`, 'info');
    updateSafetyStatus([chemicalId]);
    
    // Dr. Sarah step-by-step guidance
    if (drSarah && window.currentReactionSteps) {
        const chemicalCount = selectedPlaced.dataset.chemicals ? selectedPlaced.dataset.chemicals.split(',').length : 1;
        
        if (chemicalCount === 1) {
            // First chemical added - guide to next step
            const nextStep = window.currentReactionSteps.find(s => s.action === 'add_second_chemical');
            if (nextStep) {
                avatarSpeak(nextStep.text, 'happy');
                window.currentStepIndex = nextStep.step - 1;
            } else {
                avatarSpeak("Good! You added the first chemical. Now add the second one to see the reaction!", 'happy');
            }
        }
    } else if (drSarah) {
        const chemicalCount = selectedPlaced.dataset.chemicals ? selectedPlaced.dataset.chemicals.split(',').length : 1;
        if (chemicalCount === 1) {
            avatarSpeak("Good! You added the first chemical. Now add the second one to see the reaction!", 'happy');
        }
    }
}

// Mix Chemical Colors
function mixChemicalColors(element, chemicalIds) {
    const liquidDiv = element.querySelector('.liquid');
    if (!liquidDiv) return;
    
    const selectedChemicals = chemicalIds.map(id => chemicals.find(c => c.id === id)).filter(Boolean);
    if (selectedChemicals.length === 0) return;
    
    // Blend colors
    const colors = selectedChemicals.map(c => c.color);
    const blendedColor = blendColors(colors);
    
    liquidDiv.style.backgroundColor = blendedColor;
    liquidDiv.style.height = '75%';
}

// Blend Colors Helper
function blendColors(colors) {
    if (colors.length === 1) return colors[0];
    
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    const rgbToHex = (r, g, b) => {
        return '#' + [r, g, b].map(x => {
            const hex = Math.round(x).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    };

    const rgbColors = colors.map(hexToRgb).filter(Boolean);
    if (rgbColors.length === 0) return '#4FC3F7';
    
    const avg = rgbColors.reduce((acc, color) => ({
        r: acc.r + color.r / rgbColors.length,
        g: acc.g + color.g / rgbColors.length,
        b: acc.b + color.b / rgbColors.length
    }), { r: 0, g: 0, b: 0 });

    return rgbToHex(avg.r, avg.g, avg.b);
}

// Check for Chemical Equation
function checkForEquation(chemicalIds) {
    if (!chemicalIds || chemicalIds.length < 1) {
        console.log('No chemicals provided for equation check');
        return;
    }
    
    console.log('Checking for equation with:', chemicalIds);
    const sortedIds = [...chemicalIds].sort();
    
    // For single reactant reactions (like H2O2 decomposition) - check first
    if (sortedIds.length === 1) {
        for (const equation of chemicalEquations) {
            if (equation.reactants.length === 1 && equation.reactants[0] === sortedIds[0]) {
                console.log('Found single-reactant equation:', equation.name);
                showEquationPopup(equation);
                return;
            }
        }
    }
    
    // Try exact match first
    for (const equation of chemicalEquations) {
        const sortedReactants = [...equation.reactants].sort();
        if (sortedIds.length === sortedReactants.length &&
            sortedIds.every((id, i) => id === sortedReactants[i])) {
            console.log('Found exact match:', equation.name);
            showEquationPopup(equation);
            return;
        }
    }
    
    // Try matching with 2 reactants (most common case)
    if (sortedIds.length === 2) {
        for (const equation of chemicalEquations) {
            const sortedReactants = [...equation.reactants].sort();
            // Check if this equation has exactly 2 reactants and they match
            if (sortedReactants.length === 2) {
                if ((sortedIds[0] === sortedReactants[0] && sortedIds[1] === sortedReactants[1]) ||
                    (sortedIds[0] === sortedReactants[1] && sortedIds[1] === sortedReactants[0])) {
                    console.log('Found 2-reactant match:', equation.name);
                    showEquationPopup(equation);
                    return;
                }
            }
            // Also check if 2 reactants match part of a 3-reactant equation
            if (sortedReactants.length === 3) {
                const hasBoth = sortedIds.every(id => sortedReactants.includes(id));
                if (hasBoth) {
                    console.log('Found partial 3-reactant match:', equation.name);
                    showEquationPopup(equation);
                    return;
                }
            }
        }
    }
    
    console.log('No equation found for:', sortedIds);
}

// Show Equation Popup
function showEquationPopup(equation) {
    const content = document.getElementById('equationContent');
    content.innerHTML = `
        <div class="equation-display">${equation.equation}</div>
        <div class="equation-description">
            <h3>${equation.name}</h3>
            <p>${equation.description}</p>
            <p><strong>Reaction Type:</strong> ${equation.type.replace('_', ' ')}</p>
        </div>
    `;
    
    equationModal.style.display = 'block';
    currentReaction = equation;
    
    // Dr. Sarah guidance for starting reaction
    if (drSarah && window.currentReactionSteps) {
        const reactionStep = window.currentReactionSteps.find(s => s.action === 'start_reaction');
        if (reactionStep) {
            setTimeout(() => {
                avatarSpeak(reactionStep.text, 'excited');
                window.currentStepIndex = reactionStep.step - 1;
            }, 500);
        }
    }
}

// Use Equation
function useEquation() {
    if (!currentReaction || !drSarah) return;
    
    // Check safety first
    const safetyInfo = drSarah.getSafetyWarning(currentReaction, 
        currentReaction.type === 'combustion' || currentReaction.specialEffect === 'magnesium_flash' ? 'danger' : 
        currentReaction.safety === 'warning' ? 'warning' : 'safe'
    );
    
    // Show safety warning if needed
    if (safetyInfo.title.includes('Alert') || safetyInfo.title.includes('Reminder')) {
        showSafetyWarning(safetyInfo, () => {
            proceedWithReaction();
        });
    } else {
        proceedWithReaction();
    }
}

function proceedWithReaction() {
    const selectedPlaced = document.querySelector('.placed-equipment.selected');
    if (selectedPlaced) {
        const liquidDiv = selectedPlaced.querySelector('.liquid');
        const svgElement = selectedPlaced.querySelector('.equipment-svg svg');
        
        // Get real reaction color based on actual chemistry
        let reactionColor = getReactionColor(currentReaction);
        
        if (liquidDiv) {
            liquidDiv.style.height = '80%';
            liquidDiv.style.backgroundColor = reactionColor;
            liquidDiv.style.transition = 'all 1s ease';
        }
        
        // Update SVG liquid if it's a beaker/flask
        if (svgElement) {
            updateSVGLiquid(svgElement, reactionColor, 80);
        }
        
        // Show reaction effects with animation
        const specialEffect = currentReaction.specialEffect || null;
        showReactionEffects(selectedPlaced, currentReaction.type, specialEffect);
        
        // Dr. Sarah explains what's happening
        const explanation = drSarah.explainReaction(currentReaction);
        
        // Get observation step
        if (drSarah && window.currentReactionSteps) {
            const observeStep = window.currentReactionSteps.find(s => s.action === 'observe_reaction');
            if (observeStep) {
                avatarSpeak([
                    "Wow! Look at that! 🎉",
                    observeStep.text,
                    explanation.visual
                ], 'excited', 500);
            } else {
                avatarSpeak([
                    "Wow! Look at that! 🎉",
                    explanation.visual,
                    "This is chemistry in action!"
                ], 'excited', 500);
            }
        } else {
            avatarSpeak([
                "Wow! Look at that! 🎉",
                explanation.visual,
                "This is chemistry in action!"
            ], 'excited', 500);
        }
        
        // Show encouragement
        setTimeout(() => {
            avatarSpeak(drSarah.getEncouragement('success'), 'happy', 2000);
        }, 3000);
        
        // Reset steps for next reaction
        window.currentReactionSteps = null;
        window.currentStepIndex = 0;
    }
    
    addLogEntry(`⚗️ ${currentReaction.name}: ${currentReaction.equation}`, 'success');
    equationModal.style.display = 'none';
    currentReaction = null;
}

// Show Safety Warning
function showSafetyWarning(warningInfo, callback) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content safety-warning-modal">
            <div class="avatar-in-warning">
                <div class="ai-avatar concerned" style="width: 80px; height: 100px; margin: 0 auto;">
                    <div class="avatar-face" style="width: 60px; height: 60px;">
                        <div class="avatar-eyes" style="padding-top: 18px;">
                            <div class="eye left-eye"></div>
                            <div class="eye right-eye"></div>
                        </div>
                        <div class="avatar-mouth"></div>
                    </div>
                    <div class="avatar-body" style="width: 70px; height: 50px;">
                        <div class="avatar-lab-coat" style="width: 60px; height: 40px;"></div>
                    </div>
                </div>
            </div>
            <h3>${warningInfo.title}</h3>
            <p style="font-size: 1.1em; margin: 15px 0;">${warningInfo.message}</p>
            <p style="font-weight: bold; margin: 15px 0;">${warningInfo.action}</p>
            <button class="btn btn-primary" id="acknowledgeSafetyBtn" style="margin-top: 15px;">I Understand, Let's Continue</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('acknowledgeSafetyBtn').addEventListener('click', () => {
        modal.remove();
        if (callback) callback();
    });
    
    // Avatar speaks
    avatarSpeak(warningInfo.message, 'concerned');
}

// Show Reaction Effects
function showReactionEffects(element, type, specialEffect = null) {
    const bubblesContainer = element.querySelector('.bubbles-container');
    const smokeContainer = element.querySelector('.smoke-container');
    const sparksContainer = element.querySelector('.sparks-container');
    const liquidDiv = element.querySelector('.liquid');
    const effectDiv = element.querySelector('.reaction-effect');
    
    // Clear previous effects
    if (bubblesContainer) bubblesContainer.innerHTML = '';
    if (smokeContainer) smokeContainer.innerHTML = '';
    if (sparksContainer) sparksContainer.innerHTML = '';
    if (effectDiv) effectDiv.innerHTML = '';
    
    // Handle special effects first
    if (specialEffect) {
        handleSpecialEffect(element, specialEffect, liquidDiv, bubblesContainer, smokeContainer, sparksContainer, effectDiv);
        return;
    }
    
    // Standard effects based on type
    if (type === 'gas_evolution' || type === 'gas_formation' || type === 'oxidation' || type === 'decomposition') {
        createBubbles(bubblesContainer, 30);
    }
    
    if (type === 'gas_formation') {
        createSmoke(smokeContainer, 15);
    }
    
    if (type === 'oxidation' || type === 'neutralization' || type === 'combustion') {
        createSparks(sparksContainer, 20);
        if (liquidDiv) {
            liquidDiv.style.boxShadow = '0 0 20px rgba(255, 152, 0, 0.6)';
            setTimeout(() => {
                liquidDiv.style.boxShadow = '';
            }, 3000);
        }
    }
    
    if (type === 'precipitation') {
        createPrecipitate(liquidDiv, 25);
    }
    
    if (type === 'metal_acid') {
        createMetalBubbles(bubblesContainer, 40);
    }
}

// Handle Special Effects
function handleSpecialEffect(element, effectType, liquidDiv, bubblesContainer, smokeContainer, sparksContainer, effectDiv) {
    switch(effectType) {
        case 'magnesium_flash':
            createMagnesiumFlash(element, effectDiv);
            break;
        case 'vigorous_bubbles':
            createVigorousBubbles(bubblesContainer, 60);
            break;
        case 'rusting':
            createRustingEffect(liquidDiv, element);
            break;
        case 'color_neutralization':
            createColorNeutralization(liquidDiv);
            break;
        case 'rapid_bubbles':
            createRapidBubbles(bubblesContainer, 50);
            break;
        case 'metal_bubbles':
            createMetalBubbles(bubblesContainer, 40);
            break;
        case 'sudden_precipitate':
            createSuddenPrecipitate(liquidDiv, 30);
            break;
        default:
            break;
    }
}

// Create Bubbles Animation
function createBubbles(container, count) {
    if (!container) return;
    
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const bubble = document.createElement('div');
            bubble.className = 'reaction-bubble';
            const size = Math.random() * 8 + 6;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${Math.random() * 70 + 15}%`;
            bubble.style.bottom = '10%';
            bubble.style.animation = `bubble-rise ${1 + Math.random()}s ease-out infinite`;
            bubble.style.animationDelay = `${Math.random() * 0.5}s`;
            container.appendChild(bubble);
        }, i * 150);
    }
}

// Create Smoke Animation
function createSmoke(container, count) {
    if (!container) return;
    
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const smoke = document.createElement('div');
            smoke.className = 'reaction-smoke';
            const size = Math.random() * 15 + 10;
            smoke.style.width = `${size}px`;
            smoke.style.height = `${size}px`;
            smoke.style.left = `${Math.random() * 60 + 20}%`;
            smoke.style.bottom = '20%';
            smoke.style.animation = `smoke-rise ${2 + Math.random()}s ease-out`;
            container.appendChild(smoke);
            setTimeout(() => smoke.remove(), 3000);
        }, i * 200);
    }
}

// Create Sparks Animation
function createSparks(container, count) {
    if (!container) return;
    
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const spark = document.createElement('div');
            spark.className = 'reaction-spark';
            spark.style.left = `${Math.random() * 80 + 10}%`;
            spark.style.top = `${Math.random() * 60 + 20}%`;
            spark.style.animation = `sparkle ${0.5 + Math.random() * 0.5}s ease-in-out`;
            container.appendChild(spark);
            setTimeout(() => spark.remove(), 1000);
        }, i * 50);
    }
}

// Create Precipitate Animation
function createPrecipitate(liquidDiv, count) {
    if (!liquidDiv) return;
    
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'precipitate-particle';
            particle.style.left = `${Math.random() * 80 + 10}%`;
            particle.style.top = `${Math.random() * 30 + 50}%`;
            particle.style.animation = `precipitate-fall ${2 + Math.random()}s ease-in`;
            liquidDiv.appendChild(particle);
            setTimeout(() => particle.remove(), 3000);
        }, i * 100);
    }
}

// Special Effect: Magnesium Flash
function createMagnesiumFlash(element, container) {
    if (!container) return;
    
    // Create bright white flash
    const flash = document.createElement('div');
    flash.className = 'magnesium-flash';
    flash.style.position = 'absolute';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.right = '0';
    flash.style.bottom = '0';
    flash.style.background = 'radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 200, 0.8) 30%, transparent 70%)';
    flash.style.borderRadius = '50%';
    flash.style.animation = 'magnesium-flash 2s ease-out';
    flash.style.zIndex = '100';
    container.appendChild(flash);
    
    // Create white powder after flash
    setTimeout(() => {
        flash.style.background = 'rgba(255, 255, 255, 0.9)';
        flash.style.animation = 'powder-appear 1s ease-in';
        
        // Add sparkles
        for (let i = 0; i < 15; i++) {
            setTimeout(() => {
                const sparkle = document.createElement('div');
                sparkle.className = 'flash-sparkle';
                sparkle.style.position = 'absolute';
                sparkle.style.left = `${Math.random() * 80 + 10}%`;
                sparkle.style.top = `${Math.random() * 80 + 10}%`;
                sparkle.style.width = '4px';
                sparkle.style.height = '4px';
                sparkle.style.background = '#FFFFFF';
                sparkle.style.borderRadius = '50%';
                sparkle.style.boxShadow = '0 0 10px #FFFFFF, 0 0 20px #FFFF00';
                sparkle.style.animation = 'sparkle-fade 1.5s ease-out';
                container.appendChild(sparkle);
                setTimeout(() => sparkle.remove(), 1500);
            }, i * 50);
        }
    }, 500);
    
    setTimeout(() => flash.remove(), 3000);
}

// Special Effect: Vigorous Bubbles (Vinegar + Baking Soda)
function createVigorousBubbles(container, count) {
    if (!container) return;
    
    // Create many bubbles rapidly
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const bubble = document.createElement('div');
            bubble.className = 'reaction-bubble vigorous';
            const size = Math.random() * 12 + 8;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${Math.random() * 75 + 12}%`;
            bubble.style.bottom = '5%';
            bubble.style.animation = `bubble-rise-fast ${0.8 + Math.random() * 0.4}s ease-out infinite`;
            bubble.style.animationDelay = `${Math.random() * 0.2}s`;
            container.appendChild(bubble);
        }, i * 50); // Much faster than normal bubbles
    }
}

// Special Effect: Rusting
function createRustingEffect(liquidDiv, element) {
    if (!liquidDiv) return;
    
    // Slowly change color to brown
    liquidDiv.style.transition = 'background-color 3s ease-in-out';
    liquidDiv.style.backgroundColor = '#8B4513'; // Brown rust color
    
    // Add rust particles
    for (let i = 0; i < 20; i++) {
        setTimeout(() => {
            const rustParticle = document.createElement('div');
            rustParticle.className = 'rust-particle';
            rustParticle.style.position = 'absolute';
            rustParticle.style.left = `${Math.random() * 80 + 10}%`;
            rustParticle.style.top = `${Math.random() * 40 + 40}%`;
            rustParticle.style.width = '3px';
            rustParticle.style.height = '3px';
            rustParticle.style.background = '#654321';
            rustParticle.style.borderRadius = '50%';
            rustParticle.style.animation = 'rust-appear 2s ease-in';
            liquidDiv.appendChild(rustParticle);
        }, i * 150);
    }
}

// Special Effect: Color Neutralization
function createColorNeutralization(liquidDiv) {
    if (!liquidDiv) return;
    
    // Start with red (acid)
    liquidDiv.style.backgroundColor = '#FF6B6B';
    liquidDiv.style.transition = 'background-color 2s ease-in-out';
    
    // Transition through colors: red -> purple -> green -> clear
    setTimeout(() => {
        liquidDiv.style.backgroundColor = '#9C27B0'; // Purple (mixing)
    }, 500);
    
    setTimeout(() => {
        liquidDiv.style.backgroundColor = '#4CAF50'; // Green (neutralized)
    }, 1000);
    
    setTimeout(() => {
        liquidDiv.style.backgroundColor = '#E3F2FD'; // Clear/neutral
        liquidDiv.style.opacity = '0.9';
    }, 2000);
}

// Special Effect: Rapid Bubbles (H2O2 decomposition)
function createRapidBubbles(container, count) {
    if (!container) return;
    
    // Very rapid, continuous bubbles
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const bubble = document.createElement('div');
            bubble.className = 'reaction-bubble rapid';
            const size = Math.random() * 10 + 5;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${Math.random() * 70 + 15}%`;
            bubble.style.bottom = '8%';
            bubble.style.animation = `bubble-rise-rapid ${0.5 + Math.random() * 0.3}s ease-out infinite`;
            bubble.style.animationDelay = `${Math.random() * 0.1}s`;
            container.appendChild(bubble);
        }, i * 30); // Very fast
    }
}

// Special Effect: Metal Bubbles (Zinc + Acid)
function createMetalBubbles(container, count) {
    if (!container) return;
    
    // Bubbles forming on metal surface (bottom of container)
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const bubble = document.createElement('div');
            bubble.className = 'reaction-bubble metal';
            const size = Math.random() * 8 + 6;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${Math.random() * 60 + 20}%`;
            bubble.style.bottom = '12%'; // Forming at bottom (metal surface)
            bubble.style.animation = `bubble-rise ${1 + Math.random()}s ease-out infinite`;
            bubble.style.animationDelay = `${Math.random() * 0.3}s`;
            bubble.style.boxShadow = '0 0 5px rgba(255, 255, 255, 0.8)';
            container.appendChild(bubble);
        }, i * 80);
    }
}

// Special Effect: Sudden Precipitate
function createSuddenPrecipitate(liquidDiv, count) {
    if (!liquidDiv) return;
    
    // Many white particles suddenly appear and fall
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const particle = document.createElement('div');
            particle.className = 'precipitate-particle sudden';
            particle.style.position = 'absolute';
            particle.style.left = `${Math.random() * 80 + 10}%`;
            particle.style.top = '20%'; // Start from top
            particle.style.width = '8px';
            particle.style.height = '8px';
            particle.style.background = 'rgba(255, 255, 255, 0.95)';
            particle.style.borderRadius = '50%';
            particle.style.boxShadow = '0 0 8px rgba(255, 255, 255, 0.8)';
            particle.style.animation = `precipitate-fall-fast ${1 + Math.random()}s ease-in`;
            liquidDiv.appendChild(particle);
            setTimeout(() => particle.remove(), 2000);
        }, i * 30); // Rapid appearance
    }
    
    // Change liquid to show precipitate settling
    setTimeout(() => {
        liquidDiv.style.background = 'linear-gradient(to top, rgba(255, 255, 255, 0.3) 0%, transparent 50%)';
    }, 500);
}

// Show Equipment Info
function showEquipmentInfo(equipmentData) {
    const title = document.getElementById('equipmentModalTitle');
    const info = document.getElementById('equipmentModalInfo');
    
    title.textContent = equipmentData.name;
    info.innerHTML = `
        <p><strong>Description:</strong> ${equipmentData.description}</p>
        <p><strong>Category:</strong> ${equipmentData.category}</p>
    `;
    
    equipmentModal.style.display = 'block';
}

// Update Safety Status
function updateSafetyStatus(chemicalIds) {
    if (!statusIndicator || !safetyMessage) return;
    
    const selected = chemicalIds.map(id => chemicals.find(c => c.id === id)).filter(Boolean);
    const maxDanger = selected.reduce((max, c) => {
        const levels = { safe: 0, warning: 1, danger: 2 };
        return Math.max(max, levels[c.safety] || 0);
    }, 0);
    
    let safetyLevel = 'safe';
    let message = 'Lab is safe';
    
    if (maxDanger === 2) {
        safetyLevel = 'danger';
        message = '⚠️ DANGER: Hazardous chemicals present';
    } else if (maxDanger === 1) {
        safetyLevel = 'warning';
        message = '⚠️ WARNING: Handle with care';
    }
    
    statusIndicator.className = `status-indicator ${safetyLevel}`;
    safetyMessage.textContent = message;
}

// Add Log Entry
function addLogEntry(message, type = 'info') {
    if (!reactionLog) return;
    const entry = document.createElement('p');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    reactionLog.insertBefore(entry, reactionLog.firstChild);
    
    while (reactionLog.children.length > 20) {
        reactionLog.removeChild(reactionLog.lastChild);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    if (!workbench) {
        console.error('Workbench element not found');
        return;
    }
    
    const surface = workbench.querySelector('.workbench-surface');
    if (surface) {
        // Drag and drop handlers
        surface.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            surface.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
        });
        
        surface.addEventListener('dragleave', (e) => {
            surface.style.backgroundColor = '';
        });
        
        surface.addEventListener('drop', (e) => {
            e.preventDefault();
            surface.style.backgroundColor = '';
            
            const equipmentId = e.dataTransfer.getData('equipmentId');
            const category = e.dataTransfer.getData('category');
            
            if (equipmentId && category) {
                const rect = workbench.getBoundingClientRect();
                const x = e.clientX - rect.left - 40;
                const y = e.clientY - rect.top - 40;
                placeEquipmentOnWorkbench(equipmentId, category, x, y);
            }
        });
        
        // Keep click for backward compatibility
        surface.addEventListener('click', (e) => {
            if (selectedEquipment && (e.target === surface || e.target.classList.contains('workbench-surface'))) {
                const rect = workbench.getBoundingClientRect();
                const x = e.clientX - rect.left - 40;
                const y = e.clientY - rect.top - 40;
                placeEquipmentOnWorkbench(selectedEquipment.id, selectedEquipment.category, x, y);
            }
        });
    }
    
    // Clear workbench
    const clearBtn = document.getElementById('clearWorkbenchBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const surface = workbench.querySelector('.workbench-surface');
            if (surface) {
                surface.innerHTML = '';
                placedEquipment = [];
                addLogEntry('Workbench cleared', 'info');
            }
        });
    }
    
    // Modal close buttons
    const closeEquipmentModal = document.getElementById('closeEquipmentModal');
    if (closeEquipmentModal) {
        closeEquipmentModal.addEventListener('click', () => {
            equipmentModal.style.display = 'none';
        });
    }
    
    const closeEquationModal = document.getElementById('closeEquationModal');
    if (closeEquationModal) {
        closeEquationModal.addEventListener('click', () => {
            equationModal.style.display = 'none';
            currentReaction = null;
        });
    }
    
    // Equation buttons
    const useEquationBtn = document.getElementById('useEquationBtn');
    if (useEquationBtn) {
        useEquationBtn.addEventListener('click', useEquation);
    }
    
    const dismissEquationBtn = document.getElementById('dismissEquationBtn');
    if (dismissEquationBtn) {
        dismissEquationBtn.addEventListener('click', () => {
            equationModal.style.display = 'none';
            currentReaction = null;
        });
    }
    
    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === equipmentModal) {
            equipmentModal.style.display = 'none';
        }
        if (e.target === equationModal) {
            equationModal.style.display = 'none';
            currentReaction = null;
        }
    });
}

// Initialize when DOM is ready
(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 0);
    }
})();
