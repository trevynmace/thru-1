using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Base item class for inventory system.
    /// Placeholder for porting from MonoGame version.
    ///
    /// Consider using ScriptableObjects for item definitions in Unity.
    /// </summary>
    [System.Serializable]
    public class Item
    {
        [Header("Identity")]
        public string Name;
        public string Description;
        public string ID;

        [Header("Properties")]
        public float Weight;
        public float Bulk;
        public int Value; // Currency value

        [Header("Inventory")]
        public ItemSlot Slot;
        public int[,] Shape; // Grid shape for Tetris-style inventory

        [Header("Visuals")]
        public Sprite Icon;
        public float RenderScale = 1f;

        [Header("State")]
        public ItemState State = ItemState.Inventory;

        public Item()
        {
        }

        public Item(string name, string description, ItemSlot slot)
        {
            Name = name;
            Description = description;
            Slot = slot;
        }
    }

    /// <summary>
    /// Equipment slots for items
    /// </summary>
    public enum ItemSlot
    {
        None,
        BackpackStraps,
        Backpack,
        Hat,
        Shirt,
        Sleeves,
        Pants,
        Shoes,
        Poles,
        Misc1,
        Misc2
    }

    /// <summary>
    /// Item state in inventory system
    /// </summary>
    public enum ItemState
    {
        Equipped,
        Inventory
    }
}
