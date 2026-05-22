// Realistic SVG Illustrations for Lab Equipment

const equipmentSVGs = {
    beaker: `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="beakerGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#E3F2FD;stop-opacity:0.3" />
                <stop offset="50%" style="stop-color:#BBDEFB;stop-opacity:0.4" />
                <stop offset="100%" style="stop-color:#90CAF9;stop-opacity:0.3" />
            </linearGradient>
            <linearGradient id="beakerLiquid" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#4FC3F7;stop-opacity:0.8" />
                <stop offset="100%" style="stop-color:#2196F3;stop-opacity:0.9" />
            </linearGradient>
        </defs>
        <!-- Beaker body -->
        <path d="M 30 20 L 35 15 L 65 15 L 70 20 L 70 100 L 30 100 Z" fill="url(#beakerGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Liquid -->
        <rect x="30" y="60" width="40" height="40" fill="url(#beakerLiquid)" opacity="0.7"/>
        <!-- Rim -->
        <line x1="30" y1="20" x2="70" y2="20" stroke="#2F4F4F" stroke-width="2"/>
        <!-- Measurement marks -->
        <line x1="72" y1="40" x2="75" y2="40" stroke="#666" stroke-width="1"/>
        <line x1="72" y1="60" x2="75" y2="60" stroke="#666" stroke-width="1"/>
        <line x1="72" y1="80" x2="75" y2="80" stroke="#666" stroke-width="1"/>
    </svg>`,
    
    erlenmeyer: `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="erlenmeyerGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#E8F5E9;stop-opacity:0.3" />
                <stop offset="50%" style="stop-color:#C8E6C9;stop-opacity:0.4" />
                <stop offset="100%" style="stop-color:#A5D6A7;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Neck -->
        <rect x="45" y="10" width="10" height="25" fill="url(#erlenmeyerGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Body (conical) -->
        <path d="M 30 35 Q 50 35 50 50 Q 50 100 50 100 L 50 110 Q 50 110 30 110 Z" 
              transform="scale(1.67, 1) translate(-10, 0)" fill="url(#erlenmeyerGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Measurement marks -->
        <line x1="52" y1="50" x2="55" y2="50" stroke="#666" stroke-width="1"/>
        <line x1="52" y1="70" x2="55" y2="70" stroke="#666" stroke-width="1"/>
    </svg>`,
    
    test_tube: `<svg viewBox="0 0 40 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="testTubeGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#E3F2FD;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#90CAF9;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Tube body -->
        <ellipse cx="20" cy="100" rx="12" ry="3" fill="#4682B4" opacity="0.5"/>
        <rect x="8" y="10" width="24" height="90" rx="2" fill="url(#testTubeGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Rim -->
        <ellipse cx="20" cy="10" rx="12" ry="2" fill="#2F4F4F"/>
    </svg>`,
    
    volumetric: `<svg viewBox="0 0 60 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="volumetricGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#F3E5F5;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#E1BEE7;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Narrow neck -->
        <rect x="25" y="10" width="10" height="80" fill="url(#volumetricGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Bulb -->
        <ellipse cx="30" cy="110" rx="20" ry="25" fill="url(#volumetricGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Calibration line -->
        <line x1="20" y1="90" x2="40" y2="90" stroke="#FF0000" stroke-width="2"/>
    </svg>`,
    
    florence: `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="florenceGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#E3F2FD;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#90CAF9;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Round bottom flask -->
        <circle cx="50" cy="80" r="35" fill="url(#florenceGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Neck -->
        <rect x="45" y="10" width="10" height="50" fill="url(#florenceGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Support stand (simplified) -->
        <rect x="40" y="105" width="20" height="5" fill="#666" opacity="0.5"/>
    </svg>`,
    
    graduated_cylinder: `<svg viewBox="0 0 50 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="cylinderGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#FFF3E0;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#FFE0B2;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Cylinder body -->
        <rect x="15" y="10" width="20" height="120" rx="2" fill="url(#cylinderGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Measurement marks -->
        <line x1="35" y1="30" x2="38" y2="30" stroke="#666" stroke-width="1"/>
        <line x1="35" y1="50" x2="38" y2="50" stroke="#666" stroke-width="1"/>
        <line x1="35" y1="70" x2="38" y2="70" stroke="#666" stroke-width="1"/>
        <line x1="35" y1="90" x2="38" y2="90" stroke="#666" stroke-width="1"/>
        <line x1="35" y1="110" x2="38" y2="110" stroke="#666" stroke-width="1"/>
    </svg>`,
    
    burette: `<svg viewBox="0 0 40 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="buretteGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#E1F5FE;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#B3E5FC;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Burette body -->
        <rect x="12" y="10" width="16" height="120" fill="url(#buretteGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Stopcock -->
        <rect x="8" y="125" width="24" height="8" fill="#666" rx="2"/>
        <!-- Measurement marks -->
        <line x1="28" y1="30" x2="30" y2="30" stroke="#666" stroke-width="1"/>
        <line x1="28" y1="50" x2="30" y2="50" stroke="#666" stroke-width="1"/>
    </svg>`,
    
    pipette: `<svg viewBox="0 0 30 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="pipetteGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#F3E5F5;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#E1BEE7;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Pipette body -->
        <rect x="10" y="10" width="10" height="100" fill="url(#pipetteGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Bulb -->
        <ellipse cx="15" cy="15" rx="8" ry="5" fill="#E1BEE7" opacity="0.5"/>
    </svg>`,
    
    goggles: `<svg viewBox="0 0 120 60" xmlns="http://www.w3.org/2000/svg">
        <!-- Left lens -->
        <circle cx="30" cy="30" r="20" fill="#E3F2FD" opacity="0.3" stroke="#2196F3" stroke-width="3"/>
        <!-- Right lens -->
        <circle cx="90" cy="30" r="20" fill="#E3F2FD" opacity="0.3" stroke="#2196F3" stroke-width="3"/>
        <!-- Bridge -->
        <rect x="48" y="25" width="24" height="10" fill="#2196F3"/>
        <!-- Straps -->
        <line x1="10" y1="30" x2="10" y2="30" stroke="#2196F3" stroke-width="4" stroke-linecap="round"/>
        <line x1="110" y1="30" x2="120" y2="30" stroke="#2196F3" stroke-width="4" stroke-linecap="round"/>
    </svg>`,
    
    stirring_rod: `<svg viewBox="0 0 20 100" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="5" width="4" height="90" fill="#C0C0C0" stroke="#808080" stroke-width="1"/>
        <circle cx="10" cy="10" r="3" fill="#FFD700"/>
    </svg>`,
    
    funnel: `<svg viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="funnelGlass" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#E3F2FD;stop-opacity:0.3" />
                <stop offset="100%" style="stop-color:#90CAF9;stop-opacity:0.3" />
            </linearGradient>
        </defs>
        <!-- Funnel cone -->
        <path d="M 40 10 L 60 60 L 50 60 L 40 60 L 20 60 Z" fill="url(#funnelGlass)" stroke="#4682B4" stroke-width="2"/>
        <!-- Stem -->
        <rect x="38" y="60" width="4" height="30" fill="url(#funnelGlass)" stroke="#4682B4" stroke-width="2"/>
    </svg>`
};

// Function to get SVG for equipment
function getEquipmentSVG(equipmentId) {
    return equipmentSVGs[equipmentId] || `<svg viewBox="0 0 100 100"><text x="50" y="50" text-anchor="middle">${equipmentId}</text></svg>`;
}

