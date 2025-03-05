// This file handles the multiplayer functionality using WebsimSocket

class LabyrinthMultiplayer {
    constructor() {
        this.room = new WebsimSocket();
        this.players = {};
        this.currentLabyrinth = null;
        this.onPlayerUpdate = null;
        this.clientId = null;
        this.username = null;
    }

    initialize() {
        this.clientId = this.room.party.client.id;
        this.username = this.room.party.client.username;
        
        // Subscribe to peer updates
        this.room.party.subscribe((peers) => {
            for (const clientId in peers) {
                if (!this.players[clientId]) {
                    this.players[clientId] = {
                        id: clientId,
                        username: peers[clientId].username,
                        position: { x: 0, y: 0, z: 0 },
                        rotation: 0
                    };
                }
            }
            
            // Remove disconnected players
            for (const playerId in this.players) {
                if (!peers[playerId]) {
                    delete this.players[playerId];
                    if (this.onPlayerUpdate) {
                        this.onPlayerUpdate(this.players);
                    }
                }
            }
        });
        
        // Handle incoming messages
        this.room.onmessage = (event) => {
            const data = event.data;
            
            switch (data.type) {
                case 'playerMove':
                    if (this.players[data.clientId]) {
                        this.players[data.clientId].position = data.position;
                        this.players[data.clientId].rotation = data.rotation;
                        
                        if (this.onPlayerUpdate) {
                            this.onPlayerUpdate(this.players);
                        }
                    }
                    break;
                    
                case 'labyrinthEnter':
                    console.log(`Player ${data.username} entered labyrinth: ${data.labyrinthId}`);
                    break;
                    
                case 'labyrinthExit':
                    console.log(`Player ${data.username} exited labyrinth: ${data.labyrinthId}`);
                    break;
                    
                default:
                    console.log('Received unknown event:', data);
            }
        };
    }
    
    enterLabyrinth(labyrinthId) {
        this.currentLabyrinth = labyrinthId;
        
        this.room.send({
            type: 'labyrinthEnter',
            labyrinthId: labyrinthId,
            echo: true
        });
    }
    
    exitLabyrinth() {
        if (this.currentLabyrinth) {
            this.room.send({
                type: 'labyrinthExit',
                labyrinthId: this.currentLabyrinth,
                echo: true
            });
            
            this.currentLabyrinth = null;
        }
    }
    
    updatePlayerPosition(position, rotation) {
        // Update local player
        if (this.players[this.clientId]) {
            this.players[this.clientId].position = position;
            this.players[this.clientId].rotation = rotation;
        }
        
        // Send update to other players
        this.room.send({
            type: 'playerMove',
            position: position,
            rotation: rotation,
            echo: false
        });
    }
    
    setPlayerUpdateCallback(callback) {
        this.onPlayerUpdate = callback;
    }
    
    // Track player interaction with the labyrinth
    recordInteraction(interactionType, details) {
        if (!this.currentLabyrinth) return;
        
        this.room.collection('labyrinthInteraction').create({
            labyrinthId: this.currentLabyrinth,
            interactionType: interactionType,
            details: details,
            position: this.players[this.clientId]?.position || { x: 0, y: 0, z: 0 }
        });
    }
}

// Export as a singleton
export default new LabyrinthMultiplayer();

