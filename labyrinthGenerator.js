import * as THREE from 'three';

class LabyrinthGenerator {
    constructor() {
        this.maze = null;
        this.size = 0;
        this.biomeTextures = [];
        this.difficulty = 'medium';
        this.seed = 0;
    }
    
    async generateFromData(labyrinthData) {
        this.size = labyrinthData.layout.size;
        this.seed = labyrinthData.layout.seed;
        this.difficulty = labyrinthData.difficulty;
        this.biomeTextures = labyrinthData.biomeTextures;
        
        // Generate wall textures from descriptions if needed
        await this.generateTexturesFromDescriptions();
        
        // Generate the maze structure
        this.maze = this.generateMaze();
        
        return {
            maze: this.maze,
            size: this.size,
            startPosition: labyrinthData.layout.startPosition,
            endPosition: labyrinthData.layout.endPosition,
            textures: this.biomeTextures
        };
    }
    
    async generateTexturesFromDescriptions() {
        // For each biome, generate wall texture if it doesn't exist
        for (let i = 0; i < this.biomeTextures.length; i++) {
            const biome = this.biomeTextures[i];
            
            // Generate wall texture image if it doesn't have a URL
            if (!biome.wallTextureUrl) {
                try {
                    const wallPrompt = `Create a seamless texture for ${biome.wallTexture}. Make it detailed and suitable for a labyrinth wall.`;
                    
                    const wallTextureResult = await websim.imageGen({
                        prompt: wallPrompt,
                        aspect_ratio: "1:1"
                    });
                    
                    this.biomeTextures[i].wallTextureUrl = wallTextureResult.url;
                } catch (error) {
                    console.error('Error generating wall texture:', error);
                    // Fallback to a default texture
                    this.biomeTextures[i].wallTextureUrl = '#';
                }
            }
            
            // Generate floor texture image if it doesn't have a URL
            if (!biome.floorTextureUrl) {
                try {
                    const floorPrompt = `Create a seamless texture for ${biome.floorTexture}. Make it detailed and suitable for a labyrinth floor.`;
                    
                    const floorTextureResult = await websim.imageGen({
                        prompt: floorPrompt,
                        aspect_ratio: "1:1"
                    });
                    
                    this.biomeTextures[i].floorTextureUrl = floorTextureResult.url;
                } catch (error) {
                    console.error('Error generating floor texture:', error);
                    // Fallback to a default texture
                    this.biomeTextures[i].floorTextureUrl = '#';
                }
            }
        }
    }
    
    generateMaze() {
        // Maze generation algorithm (Recursive Backtracker / DFS)
        const maze = Array(this.size).fill().map(() => Array(this.size).fill(1));
        
        // Set all border cells to walls
        for (let i = 0; i < this.size; i++) {
            maze[0][i] = 1;
            maze[this.size - 1][i] = 1;
            maze[i][0] = 1;
            maze[i][this.size - 1] = 1;
        }
        
        // Initialize with a pseudo-random seed
        let rand = this.seededRandom(this.seed);
        
        // Start at a random even position
        const startX = Math.floor(rand() * (this.size / 2 - 2)) * 2 + 1;
        const startY = Math.floor(rand() * (this.size / 2 - 2)) * 2 + 1;
        
        // Create passage
        maze[startY][startX] = 0;
        
        // Stack for backtracking
        const stack = [[startX, startY]];
        
        // DFS to carve out the maze
        while (stack.length > 0) {
            const [x, y] = stack[stack.length - 1];
            
            // Get available directions
            const directions = [];
            
            if (y > 2 && maze[y - 2][x] === 1) directions.push('up');
            if (x < this.size - 3 && maze[y][x + 2] === 1) directions.push('right');
            if (y < this.size - 3 && maze[y + 2][x] === 1) directions.push('down');
            if (x > 2 && maze[y][x - 2] === 1) directions.push('left');
            
            if (directions.length === 0) {
                // Backtrack if no available directions
                stack.pop();
                continue;
            }
            
            // Choose a random direction
            const direction = directions[Math.floor(rand() * directions.length)];
            
            // Create passage in that direction
            switch (direction) {
                case 'up':
                    maze[y - 1][x] = 0;
                    maze[y - 2][x] = 0;
                    stack.push([x, y - 2]);
                    break;
                case 'right':
                    maze[y][x + 1] = 0;
                    maze[y][x + 2] = 0;
                    stack.push([x + 2, y]);
                    break;
                case 'down':
                    maze[y + 1][x] = 0;
                    maze[y + 2][x] = 0;
                    stack.push([x, y + 2]);
                    break;
                case 'left':
                    maze[y][x - 1] = 0;
                    maze[y][x - 2] = 0;
                    stack.push([x - 2, y]);
                    break;
            }
        }
        
        // Assign biomes to different regions of the maze
        return this.assignBiomes(maze);
    }
    
    assignBiomes(maze) {
        const biomeMap = Array(this.size).fill().map(() => Array(this.size).fill(0));
        
        // Divide the maze into regions based on distance from center
        const centerX = Math.floor(this.size / 2);
        const centerY = Math.floor(this.size / 2);
        
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                // Calculate distance from center
                const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
                const maxDistance = Math.sqrt(Math.pow(this.size, 2) + Math.pow(this.size, 2)) / 2;
                
                // Normalize distance to 0-1 range
                const normalizedDistance = distance / maxDistance;
                
                // Assign biome based on distance
                let biomeIndex;
                if (normalizedDistance < 0.33) {
                    biomeIndex = 0;
                } else if (normalizedDistance < 0.66) {
                    biomeIndex = 1;
                } else {
                    biomeIndex = 2;
                }
                
                biomeMap[y][x] = biomeIndex;
            }
        }
        
        // Add some randomness to biome borders
        const rand = this.seededRandom(this.seed + 1000);
        for (let y = 1; y < this.size - 1; y++) {
            for (let x = 1; x < this.size - 1; x++) {
                if (rand() < 0.15) {
                    // Get a random neighboring biome
                    const neighbors = [
                        biomeMap[y - 1][x],
                        biomeMap[y][x + 1],
                        biomeMap[y + 1][x],
                        biomeMap[y][x - 1]
                    ];
                    
                    const randomNeighbor = neighbors[Math.floor(rand() * neighbors.length)];
                    biomeMap[y][x] = randomNeighbor;
                }
            }
        }
        
        return { grid: maze, biomeMap: biomeMap };
    }
    
    seededRandom(seed) {
        return function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }
}

export default new LabyrinthGenerator();

