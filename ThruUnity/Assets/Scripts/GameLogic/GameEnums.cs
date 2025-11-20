namespace Thru
{
    /// <summary>
    /// Main application states - controls which major view/screen is active
    /// </summary>
    public enum GameState
    {
        Loading,
        Quit,
        Start,
        Menu,
        NewGame,
        Game,
        Final,
        PlayerDesign,
        MainSettings,
        Options,
        CharacterCreation
    }

    /// <summary>
    /// Sub-states within the Game state - controls gameplay views
    /// </summary>
    public enum PlayState
    {
        Play,
        Pause,
        Encounter,
        Map,
        Inventory,
        Dialogue,
        Cutscene,
        Settings,
        Road,
        Town,
        Trailhead,
    }

    /// <summary>
    /// Inventory interaction states for drag-and-drop
    /// </summary>
    public enum InventoryState
    {
        Mouse,
        FreeSpace,
        Equipment,
        InventoryBoard
    }

    /// <summary>
    /// Button/interaction states
    /// </summary>
    public enum ButtonState
    {
        Up,
        Down,
        Hover,
        JustReleased
    }
}
