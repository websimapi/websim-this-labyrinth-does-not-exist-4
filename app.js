const { useState, useEffect, useMemo } = React;
const { createRoot } = ReactDOM;

const App = () => {
    const [labyrinths, setLabyrinths] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [formData, setFormData] = useState({
        theme: '',
        difficulty: 'medium',
        description: ''
    });
    
    const room = useMemo(() => new WebsimSocket(), []);
    
    useEffect(() => {
        const loadLabyrinths = () => {
            // Subscribe to labyrinths collection updates
            room.collection('labyrinth').subscribe((labyrinthsList) => {
                setLabyrinths(labyrinthsList.reverse());
            });
        };
        
        loadLabyrinths();
    }, [room]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleGenerateLabyrinth = async (e) => {
        e.preventDefault();
        
        if (!formData.theme.trim()) {
            alert("Please enter a theme for your labyrinth");
            return;
        }
        
        setIsGenerating(true);
        
        try {
            // Get username of the creator
            const creatorUsername = (await window.websim.getCreatedBy()).username;
            
            // Generate labyrinth description with LLM
            const descriptionPrompt = `Create a detailed and vivid description for a labyrinth with the theme "${formData.theme}" at ${formData.difficulty} difficulty. Include details about the atmosphere, what makes it unique, what dangers might be present, and what secrets it might hide. Make it mysterious and intriguing.`;
            
            const descriptionCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are a creative writer specializing in fantasy settings and elaborate mazes. Your descriptions should be evocative, detailed, and mysterious."
                    },
                    {
                        role: "user",
                        content: descriptionPrompt
                    }
                ]
            });
            
            const labyrinthDescription = descriptionCompletion.content;
            
            // Generate image with LLM based on description
            const imagePrompt = `Create a top-down view of a labyrinth based on this description: ${labyrinthDescription}. Make it look like an ancient map or blueprint of the maze structure.`;
            
            const imageResult = await websim.imageGen({
                prompt: imagePrompt,
                aspect_ratio: "1:1"
            });
            
            // Generate biome textures with LLM
            const texturesPrompt = `Generate JSON with unique wall and floor texture descriptions for a labyrinth with theme "${formData.theme}". Include 3 different biome variations. For each biome, provide: name, wallColor, floorColor, wallTexture, floorTexture, and ambientSound. Make the descriptions detailed enough to evoke a strong visual.`;
            
            const texturesCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "You are a game environment designer specializing in creating detailed texture descriptions that can be visualized in a 3D game environment."
                    },
                    {
                        role: "user",
                        content: texturesPrompt
                    }
                ],
                json: true
            });
            
            const biomeTextures = JSON.parse(texturesCompletion.content);
            
            // Store labyrinth data in the database
            const newLabyrinth = await room.collection('labyrinth').create({
                title: formData.theme,
                description: labyrinthDescription,
                image: imageResult.url,
                difficulty: formData.difficulty,
                createdBy: creatorUsername,
                biomeTextures: biomeTextures,
                layout: generateLabyrinthLayout(formData.difficulty),
                timestamp: new Date().toISOString()
            });
            
            setFormData({
                theme: '',
                difficulty: 'medium',
                description: ''
            });
            
            setIsGenerating(false);
        } catch (error) {
            console.error('Error generating labyrinth:', error);
            setIsGenerating(false);
            alert('Failed to generate labyrinth. Please try again.');
        }
    };

    const handlePlayLabyrinth = (labyrinth) => {
        // Pass the labyrinth data to the game renderer
        initializeLabyrinthGame(labyrinth, room);
        
        // Show game container
        document.getElementById('root').classList.add('hidden');
        document.getElementById('gameContainer').classList.remove('hidden');
        
        // Loading screen will be handled by the game renderer
    };

    return (
        <div className="container">
            <header>
                <h1>This Labyrinth Does Not Exist</h1>
                <p className="subtitle">Generate and explore impossible labyrinths</p>
            </header>
            
            <form className="generator-form" onSubmit={handleGenerateLabyrinth}>
                <div className="form-group">
                    <label htmlFor="theme">Labyrinth Theme</label>
                    <input 
                        type="text" 
                        id="theme" 
                        name="theme" 
                        placeholder="e.g., Ancient Greece, Cyberpunk, Underwater Ruins" 
                        value={formData.theme}
                        onChange={handleInputChange}
                        required
                    />
                </div>
                
                <div className="form-group">
                    <label htmlFor="difficulty">Difficulty</label>
                    <select 
                        id="difficulty" 
                        name="difficulty" 
                        value={formData.difficulty}
                        onChange={handleInputChange}
                    >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                        <option value="nightmare">Nightmare</option>
                    </select>
                </div>
                
                <div className="button-group">
                    <button 
                        type="submit" 
                        className="generate-btn"
                        disabled={isGenerating}
                    >
                        {isGenerating ? 'Generating...' : 'Generate New Labyrinth'}
                    </button>
                </div>
            </form>
            
            <h2>Labyrinth Gallery</h2>
            
            <div className="gallery">
                {labyrinths.length === 0 ? (
                    <p>No labyrinths yet. Be the first to create one!</p>
                ) : (
                    labyrinths.map(labyrinth => (
                        <div className="gallery-item" key={labyrinth.id} onClick={() => handlePlayLabyrinth(labyrinth)}>
                            <img 
                                src={labyrinth.image} 
                                alt={labyrinth.title} 
                                className="gallery-img" 
                            />
                            <div className="gallery-details">
                                <h3 className="gallery-title">{labyrinth.title}</h3>
                                <p className="gallery-author">Created by {labyrinth.username}</p>
                                <p className="gallery-description">{labyrinth.description}</p>
                                <div className="gallery-actions">
                                    <span>Difficulty: {labyrinth.difficulty}</span>
                                    <button className="play-button">Explore</button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// Helper function to generate a basic labyrinth layout based on difficulty
function generateLabyrinthLayout(difficulty) {
    let size;
    switch(difficulty) {
        case 'easy': size = 15; break;
        case 'medium': size = 25; break;
        case 'hard': size = 35; break;
        case 'nightmare': size = 50; break;
        default: size = 25;
    }
    
    // Generate a simple maze layout (this is a placeholder)
    // In a real implementation, this would be a more complex algorithm
    const layout = {
        size: size,
        startPosition: { x: 1, y: 1 },
        endPosition: { x: size - 2, y: size - 2 },
        seed: Math.floor(Math.random() * 1000000)
    };
    
    return layout;
}

const root = createRoot(document.getElementById('root'));
root.render(<App />);

