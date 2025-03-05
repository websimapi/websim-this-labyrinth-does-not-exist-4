import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import labyrinthGenerator from './labyrinthGenerator.js';
import multiplayer from './websocket.js';

// Global game state
let scene, camera, renderer, controls;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let raycaster = new THREE.Raycaster();
let playerHeight = 1.8;
let walls = [];
let playerMeshes = {};
let currentLabyrinth = null;
let joystick = null;
let mobileControls = false;
let audioContext = null;
let musicBuffer = null;
let musicSource = null;
let isPlaying = false;
let prevTime = performance.now();
let loadingScreen = null;
let overlayInfo = null;
let currentBiomeIndex = 0;

// Initialize the game
function initializeLabyrinthGame(labyrinth, room) {
    currentLabyrinth = labyrinth;
    loadingScreen = document.getElementById('loadingScreen');
    overlayInfo = document.getElementById('overlayInfo');
    
    // Show loading screen
    loadingScreen.style.display = 'flex';
    document.getElementById('loadingText').textContent = 'Generating your labyrinth...';
    
    // Initialize multiplayer
    multiplayer.initialize();
    multiplayer.setPlayerUpdateCallback(updatePlayerMeshes);
    multiplayer.enterLabyrinth(labyrinth.id);
    
    // Set up event listener for the back button
    document.getElementById('backButton').addEventListener('click', exitLabyrinth);
    
    // Check if we're on mobile
    mobileControls = isMobile();
    
    // Generate the labyrinth
    generateLabyrinth(labyrinth);
}

async function generateLabyrinth(labyrinth) {
    try {
        // Generate the maze data
        const mazeData = await labyrinthGenerator.generateFromData(labyrinth);
        
        // Initialize Three.js scene
        initThreeJS(mazeData);
        
        // Hide loading screen
        loadingScreen.style.display = 'none';
        
        // Set up mobile controls if needed
        if (mobileControls) {
            setupMobileControls();
        } else {
            setupDesktopControls();
        }
        
        // Load and play background music
        loadBackgroundMusic();
        
    } catch (error) {
        console.error('Error generating labyrinth:', error);
        alert('Failed to generate labyrinth. Returning to gallery.');
        exitLabyrinth();
    }
}

function initThreeJS(mazeData) {
    const canvas = document.getElementById('gameCanvas');
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.02);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(mazeData.startPosition.x * 2, playerHeight, mazeData.startPosition.y * 2);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Create lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const pointLight = new THREE.PointLight(0xffffff, 1, 100);
    pointLight.position.set(0, 10, 0);
    scene.add(pointLight);
    
    // Create controls
    controls = new PointerLockControls(camera, document.body);
    scene.add(controls.getObject());
    
    // Load textures for biomes
    const textureLoader = new THREE.TextureLoader();
    const textures = [];
    
    // For each biome, load wall and floor textures
    for (const biome of mazeData.textures) {
        const biomeTextures = {
            wall: biome.wallTextureUrl ? textureLoader.load(biome.wallTextureUrl) : null,
            floor: biome.floorTextureUrl ? textureLoader.load(biome.floorTextureUrl) : null,
            wallColor: biome.wallColor || '#333333',
            floorColor: biome.floorColor || '#555555',
            name: biome.name
        };
        
        // Ensure textures are properly set up for tiling
        if (biomeTextures.wall) {
            biomeTextures.wall.wrapS = THREE.RepeatWrapping;
            biomeTextures.wall.wrapT = THREE.RepeatWrapping;
            biomeTextures.wall.repeat.set(1, 1);
        }
        
        if (biomeTextures.floor) {
            biomeTextures.floor.wrapS = THREE.RepeatWrapping;
            biomeTextures.floor.wrapT = THREE.RepeatWrapping;
            biomeTextures.floor.repeat.set(mazeData.size/2, mazeData.size/2);
        }
        
        textures.push(biomeTextures);
    }
    
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(mazeData.size * 2, mazeData.size * 2);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x555555,
        map: textures[0].floor,
        roughness: 1.0,
        side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);
    
    // Create ceiling
    const ceilingGeometry = new THREE.PlaneGeometry(mazeData.size * 2, mazeData.size * 2);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        roughness: 1.0,
        side: THREE.DoubleSide
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 3;
    scene.add(ceiling);
    
    // Create walls
    const wallGeometry = new THREE.BoxGeometry(2, 3, 2);
    
    for (let y = 0; y < mazeData.size; y++) {
        for (let x = 0; x < mazeData.size; x++) {
            if (mazeData.maze.grid[y][x] === 1) {
                // Get biome index for this position
                const biomeIndex = mazeData.maze.biomeMap[y][x];
                const biomeTexture = textures[biomeIndex] || textures[0];
                
                const wallMaterial = new THREE.MeshStandardMaterial({ 
                    color: biomeTexture.wallColor,
                    map: biomeTexture.wall,
                    roughness: 0.8
                });
                
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.position.set(x * 2, 1.5, y * 2);
                scene.add(wall);
                walls.push(wall);
            }
        }
    }
    
    // Start animation loop
    animate();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
    
    // Update overlay with initial biome info
    updateOverlayInfo(textures[0].name);
}

function setupDesktopControls() {
    // Set up keyboard controls
    const onKeyDown = function(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
                
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
                
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
                
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
                
            case 'Escape':
                exitLabyrinth();
                break;
        }
    };
    
    const onKeyUp = function(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
                
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
                
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
                
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
    };
    
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    
    // Lock pointer on click
    document.addEventListener('click', function() {
        controls.lock();
    });
    
    controls.addEventListener('lock', function() {
        if (!isPlaying) {
            startMusic();
        }
    });
}

function setupMobileControls() {
    // Show mobile controls
    document.getElementById('mobileControls').style.display = 'flex';
    
    // Set up joystick
    const joystickZone = document.getElementById('joystickZone');
    joystick = nipplejs.create({
        zone: joystickZone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'rgba(233, 69, 96, 0.8)',
        size: 120
    });
    
    joystick.on('move', function(evt, data) {
        const forward = data.vector.y;
        const side = data.vector.x;
        
        moveForward = forward < -0.2;
        moveBackward = forward > 0.2;
        moveLeft = side < -0.2;
        moveRight = side > 0.2;
    });
    
    joystick.on('end', function() {
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
    });
    
    // No need for pointer lock on mobile
    startMusic();
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    
    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();
    
    if (moveForward || moveBackward) velocity.z -= direction.z * 20.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 20.0 * delta;
    
    if (controls.isLocked) {
        raycaster.ray.origin.copy(controls.getObject().position);
        
        // Check for collisions
        const collisions = detectCollisions();
        
        if (!collisions.forward && (moveForward || moveBackward)) {
            controls.moveForward(-velocity.z * delta);
        }
        
        if (!collisions.side && (moveLeft || moveRight)) {
            controls.moveRight(-velocity.x * delta);
        }
        
        // Check which biome the player is in
        checkCurrentBiome();
        
        // Update player position in multiplayer
        updatePlayerPosition();
    }
    
    renderer.render(scene, camera);
    prevTime = time;
}

function detectCollisions() {
    const result = { forward: false, side: false };
    
    // Player position
    const playerPos = controls.getObject().position.clone();
    
    // Check for collisions in all directions
    const directions = [
        new THREE.Vector3(0, 0, -1), // forward
        new THREE.Vector3(0, 0, 1),  // backward
        new THREE.Vector3(-1, 0, 0), // left
        new THREE.Vector3(1, 0, 0)   // right
    ];
    
    const collisionDistance = 1.0; // Distance to check for collisions
    
    for (let i = 0; i < directions.length; i++) {
        // Rotate direction based on camera rotation
        const rotatedDirection = directions[i].clone();
        rotatedDirection.applyQuaternion(camera.quaternion);
        
        raycaster.set(playerPos, rotatedDirection);
        const intersects = raycaster.intersectObjects(walls);
        
        if (intersects.length > 0 && intersects[0].distance < collisionDistance) {
            if (i < 2) {
                result.forward = true;
            } else {
                result.side = true;
            }
        }
    }
    
    return result;
}

function checkCurrentBiome() {
    // Get player position in grid coordinates
    const playerPos = controls.getObject().position;
    const gridX = Math.floor(playerPos.x / 2);
    const gridZ = Math.floor(playerPos.z / 2);
    
    // Check if coordinates are valid
    if (gridX >= 0 && gridX < currentLabyrinth.layout.size && 
        gridZ >= 0 && gridZ < currentLabyrinth.layout.size) {
        
        // Get biome at player position
        const biomeIndex = labyrinthGenerator.maze.biomeMap[gridZ][gridX];
        
        // If biome changed, update display
        if (biomeIndex !== undefined && biomeIndex !== currentBiomeIndex) {
            currentBiomeIndex = biomeIndex;
            updateOverlayInfo(currentLabyrinth.biomeTextures[biomeIndex].name);
        }
    }
}

function updateOverlayInfo(biomeName) {
    if (overlayInfo) {
        overlayInfo.textContent = `Current Area: ${biomeName}`;
    }
}

function updatePlayerPosition() {
    const position = controls.getObject().position;
    const rotation = camera.rotation.y;
    
    // Only send update if player moved significantly
    multiplayer.updatePlayerPosition({
        x: position.x,
        y: position.y,
        z: position.z
    }, rotation);
}

function updatePlayerMeshes(players) {
    // Remove player meshes that are no longer connected
    for (const id in playerMeshes) {
        if (!players[id]) {
            scene.remove(playerMeshes[id]);
            delete playerMeshes[id];
        }
    }
    
    // Create or update player meshes
    for (const id in players) {
        // Skip our own player
        if (id === multiplayer.clientId) continue;
        
        const player = players[id];
        
        if (!playerMeshes[id]) {
            // Create new player mesh
            const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
            const material = new THREE.MeshLambertMaterial({ color: randomPlayerColor(id) });
            const mesh = new THREE.Mesh(geometry, material);
            
            // Add username label
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 64;
            const context = canvas.getContext('2d');
            context.font = '24px Arial';
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.fillText(player.username, 128, 24);
            
            const texture = new THREE.CanvasTexture(canvas);
            const labelMaterial = new THREE.SpriteMaterial({ map: texture });
            const label = new THREE.Sprite(labelMaterial);
            label.scale.set(2, 0.5, 1);
            label.position.y = 1.2;
            
            mesh.add(label);
            playerMeshes[id] = mesh;
            scene.add(mesh);
        }
        
        // Update position
        if (player.position) {
            playerMeshes[id].position.set(player.position.x, player.position.y, player.position.z);
        }
        
        // Update rotation
        if (player.rotation !== undefined) {
            playerMeshes[id].rotation.y = player.rotation;
        }
    }
}

function randomPlayerColor(id) {
    // Generate consistent color based on id
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const color = new THREE.Color();
    color.setHSL((hash % 360) / 360, 0.8, 0.6);
    return color;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

async function loadBackgroundMusic() {
    try {
        // Prepare to load MIDI file
        const response = await fetch('https://cdn.websim.ai/c/Nv9jnKqTxdtEeqgXUdh9rGE73KIIWGpH/example.mid');
        const midiData = await response.arrayBuffer();
        
        // Set up audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Store the MIDI data
        musicBuffer = midiData;
    } catch (error) {
        console.error('Error loading background music:', error);
    }
}

function startMusic() {
    if (!isPlaying && musicBuffer) {
        // Note: Modern browsers require user interaction to start audio
        try {
            // Simple way to play MIDI file in browser
            const music = document.getElementById('backgroundMusic');
            music.src = URL.createObjectURL(new Blob([musicBuffer], { type: 'audio/midi' }));
            music.play();
            
            isPlaying = true;
        } catch (error) {
            console.error('Error playing background music:', error);
        }
    }
}

function exitLabyrinth() {
    // Clean up resources
    if (renderer) {
        renderer.dispose();
    }
    
    if (controls) {
        controls.unlock();
    }
    
    if (joystick) {
        joystick.destroy();
    }
    
    // Stop music
    const music = document.getElementById('backgroundMusic');
    music.pause();
    music.src = '';
    
    // Clean up event listeners
    window.removeEventListener('resize', onWindowResize);
    
    // Exit the labyrinth in multiplayer
    multiplayer.exitLabyrinth();
    
    // Hide game container and show gallery
    document.getElementById('gameContainer').classList.add('hidden');
    document.getElementById('root').classList.remove('hidden');
    
    // Reset game state
    scene = null;
    camera = null;
    renderer = null;
    controls = null;
    walls = [];
    playerMeshes = {};
    currentLabyrinth = null;
    joystick = null;
    audioContext = null;
    musicBuffer = null;
    musicSource = null;
    isPlaying = false;
}

function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Export the initialization function
window.initializeLabyrinthGame = initializeLabyrinthGame;

