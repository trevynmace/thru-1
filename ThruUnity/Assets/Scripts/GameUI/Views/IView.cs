namespace Thru
{
    /// <summary>
    /// Interface for main application views (Menu, Game, Settings, etc.)
    /// In Unity, views are typically UI Canvases or scene sections.
    /// Unlike MonoGame, rendering is handled automatically by Unity components.
    /// </summary>
    public interface IView
    {
        /// <summary>
        /// Called every frame to update game logic.
        /// Returns the next state (or current state to stay).
        /// </summary>
        GameState UpdateView();

        /// <summary>
        /// Show this view (enable Canvas/GameObjects)
        /// </summary>
        void Show();

        /// <summary>
        /// Hide this view (disable Canvas/GameObjects)
        /// </summary>
        void Hide();

        /// <summary>
        /// Initialize the view with required references
        /// </summary>
        void Initialize(GameStateManager stateManager);
    }

    /// <summary>
    /// Interface for sub-views within the Game state (Play, Map, Inventory, etc.)
    /// </summary>
    public interface IGameView
    {
        /// <summary>
        /// Called every frame to update game logic.
        /// Returns the next play state (or current state to stay).
        /// </summary>
        PlayState UpdateView();

        /// <summary>
        /// Show this game view
        /// </summary>
        void Show();

        /// <summary>
        /// Hide this game view
        /// </summary>
        void Hide();

        /// <summary>
        /// Initialize the game view with required references
        /// </summary>
        void Initialize(GameStateManager stateManager);
    }
}
