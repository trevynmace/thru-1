using UnityEngine;
using System.Collections.Generic;

namespace Thru
{
    /// <summary>
    /// Main inventory system controller.
    /// Manages items, grid inventory, and equipment.
    /// Replaces MonoGame's InventoryController and InventoryGameBoard.
    /// </summary>
    public class InventorySystem : MonoBehaviour
    {
        public static InventorySystem Instance { get; private set; }

        [Header("References")]
        public GridInventory gridInventory;
        public Transform itemContainer; // Parent for item UI elements
        public Transform freeSpaceContainer; // Where unplaced items go

        [Header("Equipment Slots")]
        public EquipmentSlot[] equipmentSlots;

        [Header("Settings")]
        public int gridMargin = 50;

        // All items in the system
        public List<ItemDraggableGroup> Items { get; private set; } = new List<ItemDraggableGroup>();

        // Currently dragged item
        public ItemDraggableGroup DraggedItem { get; set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
        }

        private void Start()
        {
            // Find equipment slots if not assigned
            if (equipmentSlots == null || equipmentSlots.Length == 0)
            {
                equipmentSlots = GetComponentsInChildren<EquipmentSlot>();
            }
        }

        /// <summary>
        /// Create and add an item to the inventory system
        /// </summary>
        public ItemDraggableGroup CreateItem(Item item, Sprite icon, Vector2 homePosition)
        {
            // Create item group GameObject
            GameObject itemObj = new GameObject($"Item_{item.Name}");
            itemObj.transform.SetParent(freeSpaceContainer ?? itemContainer, false);

            var rectTransform = itemObj.AddComponent<RectTransform>();
            rectTransform.anchoredPosition = homePosition;

            // Add group component
            var group = itemObj.AddComponent<ItemDraggableGroup>();
            group.gridMargin = gridMargin;
            group.Initialize(item, item.Shape ?? GetDefaultShape(), homePosition, icon);

            Items.Add(group);

            return group;
        }

        private int[,] GetDefaultShape()
        {
            // Default 1x1 shape
            return new int[,] { { 1 } };
        }

        /// <summary>
        /// Remove an item from the system
        /// </summary>
        public void RemoveItem(ItemDraggableGroup group)
        {
            if (group == null) return;

            // Remove from grid if placed
            if (gridInventory != null && group.CurrentState == ItemDraggableGroup.GroupState.OnBoard)
            {
                gridInventory.RemoveItem(group);
            }

            // Unequip if equipped
            foreach (var slot in equipmentSlots)
            {
                if (slot.EquippedItem == group.Item)
                {
                    slot.Unequip();
                }
            }

            Items.Remove(group);
            Destroy(group.gameObject);
        }

        /// <summary>
        /// Get equipment slot by type
        /// </summary>
        public EquipmentSlot GetEquipmentSlot(ItemSlot slotType)
        {
            foreach (var slot in equipmentSlots)
            {
                if (slot.slotType == slotType)
                    return slot;
            }
            return null;
        }

        /// <summary>
        /// Get all equipped items
        /// </summary>
        public List<Item> GetEquippedItems()
        {
            var equipped = new List<Item>();
            foreach (var slot in equipmentSlots)
            {
                if (slot.IsOccupied)
                    equipped.Add(slot.EquippedItem);
            }
            return equipped;
        }

        /// <summary>
        /// Get all items on the grid
        /// </summary>
        public List<Item> GetGridItems()
        {
            var items = new List<Item>();
            foreach (var group in Items)
            {
                if (group.CurrentState == ItemDraggableGroup.GroupState.OnBoard)
                    items.Add(group.Item);
            }
            return items;
        }

        /// <summary>
        /// Load items from JSON data
        /// </summary>
        public void LoadItems(ItemData[] itemDataArray)
        {
            foreach (var data in itemDataArray)
            {
                var item = new Item
                {
                    Name = data.name,
                    Weight = data.weight,
                    Bulk = data.bulk,
                    Slot = data.itemSlot,
                    Shape = data.itemShape
                };

                // Load icon sprite
                Sprite icon = Resources.Load<Sprite>($"ItemIcons/{data.iconPath}");

                // Create at default position
                CreateItem(item, icon, new Vector2(0, Items.Count * -60));
            }
        }
    }

    /// <summary>
    /// Data structure for loading items from JSON
    /// </summary>
    [System.Serializable]
    public class ItemData
    {
        public string name;
        public string iconPath;
        public string spriteSheetPath;
        public string secondarySpriteSheetPath;
        public Vector2Int screenXY;
        public bool isFlexible;
        public float bulk;
        public float weight;
        public int[,] itemShape;
        public ItemSlot itemSlot;
    }
}
