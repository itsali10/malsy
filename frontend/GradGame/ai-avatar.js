// AI Avatar Teacher System for Grade 6 Students

class AIAvatar {
    constructor() {
        this.name = "Dr. Chem";
        this.mood = "happy";
        this.currentLesson = null;
        this.studentLevel = "beginner"; // beginner, intermediate, advanced
        this.hintsGiven = 0;
        this.maxHints = 3;
    }

    // Get simple explanation for Grade 6
    explainReaction(reaction) {
        const explanations = {
            'magnesium_oxygen': {
                simple: "When magnesium metal meets oxygen, it burns with a super bright white light! It's like a tiny firework. After it burns, you get white powder called magnesium oxide.",
                visual: "Watch for the bright flash! It's like a camera flash but in chemistry!",
                safety: "This reaction is very bright - don't look directly at it! Always wear safety goggles."
            },
            'vinegar_baking_soda': {
                simple: "Vinegar and baking soda are like best friends that love to make bubbles! When they mix, they create carbon dioxide gas - the same gas that makes soda fizzy!",
                visual: "See all those bubbles? That's the carbon dioxide gas escaping! It's like opening a soda can.",
                safety: "This reaction is safe and fun! The bubbles are just gas, like in your favorite drink."
            },
            'neutralization': {
                simple: "An acid and a base are like opposites. When you mix them, they cancel each other out! It's like mixing hot and cold water - you get something in the middle (neutral).",
                visual: "Watch the color change! The red (acid) and yellow (base) mix to make green or clear - that means they're neutralized!",
                safety: "This reaction can get warm, so be careful. But it's mostly safe!"
            },
            'rusting_iron': {
                simple: "Rust happens when iron metal meets water and air (oxygen). It's like when an old bike left outside turns brown and rusty. The iron slowly changes color!",
                visual: "See how the color slowly turns brown? That's rust forming! It takes time, just like in real life.",
                safety: "Rust itself is safe, but be careful with rusty objects - they can be sharp!"
            },
            'hydrogen_peroxide_decomp': {
                simple: "Hydrogen peroxide is like a bottle of energy! When it breaks down, it releases oxygen gas - the same gas we breathe! That's why you see so many bubbles.",
                visual: "All those bubbles are oxygen gas! It's the same gas that helps us breathe and keeps fires burning.",
                safety: "This reaction makes lots of bubbles quickly. It's safe but can be messy!"
            },
            'zinc_acid': {
                simple: "When zinc metal touches acid, it starts to fizz! The acid reacts with the metal and makes hydrogen gas bubbles. It's like the metal is breathing out bubbles!",
                visual: "See the bubbles forming on the metal? That's hydrogen gas! It's very light and wants to float away.",
                safety: "Acids can be dangerous - always wear safety goggles and gloves when working with them!"
            },
            'precipitation': {
                simple: "When two clear liquids mix, sometimes a solid appears out of nowhere! It's like magic, but it's science! The solid is called a precipitate and it sinks to the bottom.",
                visual: "Watch the white particles fall down! That's the precipitate forming. It's like snow falling in a bottle!",
                safety: "This reaction is safe to watch! The solid that forms is just a new chemical compound."
            }
        };

        const key = this.getReactionKey(reaction);
        return explanations[key] || {
            simple: "This is a chemical reaction! When chemicals mix, they can change into new substances. Watch carefully to see what happens!",
            visual: "Look for changes - bubbles, colors, or new substances forming!",
            safety: "Always be safe in the lab! Wear your safety equipment."
        };
    }

    getReactionKey(reaction) {
        const reactants = reaction.reactants.sort().join('_');
        if (reactants.includes('magnesium') && reactants.includes('oxygen')) return 'magnesium_oxygen';
        if (reactants.includes('vinegar') && reactants.includes('sodium_bicarbonate')) return 'vinegar_baking_soda';
        if (reactants.includes('iron') && reactants.includes('oxygen')) return 'rusting_iron';
        if (reactants.includes('hydrochloric') && reactants.includes('sodium_hydroxide')) return 'neutralization';
        if (reactants.includes('hydrogen_peroxide') && reactants.length === 1) return 'hydrogen_peroxide_decomp';
        if (reactants.includes('zinc') && reactants.includes('hydrochloric')) return 'zinc_acid';
        if (reactants.includes('silver_nitrate') || reactants.includes('copper_sulfate')) return 'precipitation';
        return 'default';
    }

    // Get hint based on student confusion
    getHint(context) {
        this.hintsGiven++;
        
        if (this.hintsGiven > this.maxHints) {
            return {
                text: "Don't worry! Let's try a different approach. Would you like me to show you step by step?",
                encouraging: true
            };
        }

        const hints = {
            'no_equipment': "Remember to drag equipment from the sidebar to the workbench first! Try dragging a beaker.",
            'no_chemicals': "Great! Now add some chemicals. Click on a chemical, then click on your equipment!",
            'wrong_combination': "Hmm, those chemicals don't react together. Try mixing an acid with a base, or look for reactions that make bubbles!",
            'need_safety': "Safety first! Make sure to wear safety goggles for this experiment. Drag them to the workbench!",
            'reaction_not_working': "Let me help! Make sure you've added both chemicals to the same equipment. Then click 'Use This Equation' when the popup appears!"
        };

        return {
            text: hints[context] || "Think about what happens when chemicals mix. What do you see changing?",
            encouraging: this.hintsGiven < 2
        };
    }

    // Get encouragement message
    getEncouragement(type) {
        const messages = {
            'success': [
                "Excellent work! You're becoming a great chemist! 🎉",
                "Wow! You did it perfectly! Keep up the amazing work! ⭐",
                "Fantastic! You're learning so fast! 🌟",
                "Perfect! You're a natural scientist! 🔬"
            ],
            'attempt': [
                "Good try! Don't give up - every scientist makes mistakes! 💪",
                "You're on the right track! Keep experimenting! 🧪",
                "Nice attempt! Let's try again together! 🤝",
                "That's okay! Learning takes practice. You're doing great! 🌈"
            ],
            'first_time': [
                "Welcome to the chemistry lab! I'm Dr. Chem, and I'll be your guide today! 👋",
                "Hello! Ready to learn some amazing chemistry? Let's start with something fun! 🎓",
                "Hi there! I'm so excited to teach you about chemistry today! Let's explore together! 🚀"
            ]
        };

        const list = messages[type] || messages['attempt'];
        return list[Math.floor(Math.random() * list.length)];
    }

    // Safety warning with avatar guidance
    getSafetyWarning(reaction, dangerLevel) {
        const warnings = {
            'danger': {
                title: "⚠️ Safety Alert!",
                message: "This reaction can be dangerous! It produces heat, bright light, or harmful gases. Make sure you have safety goggles on and an adult nearby!",
                avatarMood: "concerned",
                action: "Please put on safety goggles before continuing!"
            },
            'warning': {
                title: "Safety Reminder",
                message: "This reaction needs some safety equipment. Make sure you're wearing safety goggles!",
                avatarMood: "cautious",
                action: "Safety first! Let's be careful."
            },
            'safe': {
                title: "Safe to Proceed!",
                message: "This reaction is safe to watch! Just observe the amazing changes happening!",
                avatarMood: "happy",
                action: "Great! This is a safe experiment."
            }
        };

        return warnings[dangerLevel] || warnings['safe'];
    }

    // Adjust explanation based on student level
    adjustExplanation(text, level) {
        if (level === 'beginner') {
            // Use simpler words, shorter sentences
            return text
                .replace(/chemical reaction/g, 'chemical change')
                .replace(/compound/g, 'new substance')
                .replace(/molecule/g, 'tiny particles')
                .replace(/exothermic/g, 'makes heat')
                .replace(/endothermic/g, 'takes heat');
        }
        return text;
    }

    // Get step-by-step guidance for a specific reaction
    getReactionSteps(reaction) {
        if (!reaction || !reaction.reactants) {
            return this.getDefaultSteps();
        }

        const reactants = reaction.reactants;
        const firstChemical = reactants[0];
        const secondChemical = reactants[1] || null;
        
        // Get chemical names
        const getChemicalName = (id) => {
            const chemicalMap = {
                'hydrochloric': 'Hydrochloric Acid',
                'sodium_hydroxide': 'Sodium Hydroxide',
                'vinegar': 'Vinegar',
                'sodium_bicarbonate': 'Baking Soda',
                'copper_sulfate': 'Copper Sulfate',
                'magnesium': 'Magnesium',
                'oxygen': 'Oxygen',
                'iron': 'Iron',
                'water': 'Water',
                'hydrogen_peroxide': 'Hydrogen Peroxide',
                'zinc': 'Zinc',
                'silver_nitrate': 'Silver Nitrate',
                'sodium_chloride': 'Sodium Chloride'
            };
            return chemicalMap[id] || id;
        };

        // Get equipment suggestions
        const getEquipmentNeeded = (reaction) => {
            const equipmentMap = {
                'magnesium_oxygen': ['beaker', 'test tube', 'safety goggles'],
                'vinegar_baking_soda': ['beaker', 'Erlenmeyer flask'],
                'neutralization': ['beaker', 'safety goggles'],
                'copper_sulfate_naoh': ['beaker', 'test tube'],
                'rusting_iron': ['beaker', 'test tube'],
                'hydrogen_peroxide': ['beaker', 'test tube'],
                'zinc_acid': ['beaker', 'safety goggles'],
                'precipitation': ['beaker', 'test tube']
            };
            
            const key = this.getReactionKey(reaction);
            return equipmentMap[key] || ['beaker'];
        };

        const equipment = getEquipmentNeeded(reaction);
        const equipmentList = equipment.join(', ');

        const steps = [
            {
                step: 1,
                text: `Great! You selected "${reaction.name}". Let's do this step by step! 🎯`,
                action: 'selected_reaction'
            },
            {
                step: 2,
                text: `Step 1: First, get your equipment! Drag these to the workbench: ${equipmentList}. Start with the ${equipment[0]}!`,
                action: 'get_equipment',
                equipment: equipment
            },
            {
                step: 3,
                text: `Step 2: Good! Now click on the ${equipment[0]} on the workbench to select it. You'll see it highlighted!`,
                action: 'select_equipment'
            },
            {
                step: 4,
                text: `Step 3: Perfect! Now go to the Chemicals tab and click on "${getChemicalName(firstChemical)}" to add it first.`,
                action: 'add_first_chemical',
                chemical: firstChemical
            },
            {
                step: 5,
                text: secondChemical 
                    ? `Step 4: Excellent! Now add the second chemical: "${getChemicalName(secondChemical)}". Click on it in the Chemicals tab!`
                    : `Step 4: Great! Now watch what happens - this reaction only needs one chemical!`,
                action: 'add_second_chemical',
                chemical: secondChemical
            },
            {
                step: 6,
                text: `Step 5: Wonderful! When you see the equation popup, click "Start Reaction" to see the magic happen! ✨`,
                action: 'start_reaction'
            },
            {
                step: 7,
                text: `Amazing! Watch carefully - what do you see? ${this.getReactionObservation(reaction)}`,
                action: 'observe_reaction'
            }
        ];

        return steps;
    }

    getReactionObservation(reaction) {
        const observations = {
            'magnesium_oxygen': 'Look for a bright white flash!',
            'vinegar_baking_soda': 'See all those bubbles? That\'s carbon dioxide gas!',
            'neutralization': 'Watch the color change - it becomes clear or neutral!',
            'copper_sulfate_naoh': 'See the blue precipitate forming?',
            'rusting_iron': 'Watch the color slowly turn brown - that\'s rust!',
            'hydrogen_peroxide': 'Look at all those oxygen bubbles!',
            'zinc_acid': 'See the bubbles forming on the metal?',
            'precipitation': 'Watch the white solid appear and fall down!'
        };

        const key = this.getReactionKey(reaction);
        return observations[key] || 'Look for bubbles, color changes, or new substances forming!';
    }

    getDefaultSteps() {
        return [
            {
                step: 1,
                text: "Let's start! First, select a reaction from the Reactions tab.",
                action: 'select_reaction'
            },
            {
                step: 2,
                text: "Now drag a beaker to the workbench.",
                action: 'get_equipment'
            },
            {
                step: 3,
                text: "Click on the beaker to select it.",
                action: 'select_equipment'
            },
            {
                step: 4,
                text: "Add your first chemical from the Chemicals tab.",
                action: 'add_first_chemical'
            },
            {
                step: 5,
                text: "Add your second chemical to the same beaker.",
                action: 'add_second_chemical'
            },
            {
                step: 6,
                text: "Click 'Start Reaction' when the popup appears!",
                action: 'start_reaction'
            }
        ];
    }

    // Get current step guidance based on game state
    getCurrentStepGuidance(reaction, gameState) {
        const steps = this.getReactionSteps(reaction);
        
        // Determine current step based on game state
        let currentStep = 1;
        
        if (gameState.equipmentPlaced) {
            currentStep = 2;
        }
        if (gameState.equipmentSelected) {
            currentStep = 3;
        }
        if (gameState.firstChemicalAdded) {
            currentStep = 4;
        }
        if (gameState.secondChemicalAdded) {
            currentStep = 5;
        }
        if (gameState.reactionStarted) {
            currentStep = 6;
        }

        const step = steps.find(s => s.step === currentStep) || steps[0];
        
        return {
            text: step.text,
            step: currentStep,
            totalSteps: steps.length,
            action: step.action
        };
    }
}

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIAvatar;
}

