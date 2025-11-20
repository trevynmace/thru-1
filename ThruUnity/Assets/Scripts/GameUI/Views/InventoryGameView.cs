using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Inventory view wrapper.
    /// Replaces MonoGame's InventoryGameView.
    /// </summary>
    public class InventoryGameView : MonoBehaviour, IGameView
    {
        [Header("References")]
        public InventorySystem inventorySystem;
        public GridInventory gridInventory;
        public CharacterModel playerModelDisplay;

        private GameStateManager _stateManager;
        private CanvasGroup _canvasGroup;

        private void Awake()
        {
            _canvasGroup = GetComponent<CanvasGroup>();
        }

        public void Initialize(GameStateManager stateManager)
        {
            _stateManager = stateManager;

            // Find inventory system if not assigned
            if (inventorySystem == null)
                inventorySystem = FindFirstObjectByType<InventorySystem>();

            if (gridInventory == null)
                gridInventory = FindFirstObjectByType<GridInventory>();
        }

        public void Show()
        {
            gameObject.SetActive(true);
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 1f;
                _canvasGroup.interactable = true;
                _canvasGroup.blocksRaycasts = true;
            }
        }

        public void Hide()
        {
            if (_canvasGroup != null)
            {
                _canvasGroup.alpha = 0f;
                _canvasGroup.interactable = false;
                _canvasGroup.blocksRaycasts = false;
            }
            gameObject.SetActive(false);
        }

        public PlayState UpdateView()
        {
            // Close inventory with I, Tab, or Escape
            if (Input.GetKeyDown(KeyCode.I) || Input.GetKeyDown(KeyCode.Tab) || Input.GetKeyDown(KeyCode.Escape))
            {
                return PlayState.Play;
            }

            return PlayState.Inventory;
        }
    }
}
