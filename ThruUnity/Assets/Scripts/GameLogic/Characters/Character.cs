using UnityEngine;
using System.Collections.Generic;

namespace Thru
{
    /// <summary>
    /// Character class - represents player and NPCs.
    /// Placeholder for porting from MonoGame version.
    /// </summary>
    [System.Serializable]
    public class Character
    {
        [Header("Identity")]
        public string Name;
        public Genders Gender;

        [Header("Stats")]
        public Stats Stats;

        [Header("Position")]
        public Vector2 ScreenPosition;
        public Location Location;
        public Location TrailLocation;
        public Vector3 MapCoords;

        [Header("Inventory")]
        public List<Item> Equipped = new List<Item>();
        public List<Item> Inventory = new List<Item>();

        [Header("Social")]
        public Dictionary<string, Character> Tramily = new Dictionary<string, Character>();

        // Reference to visual model (set at runtime)
        [System.NonSerialized]
        public GameObject CharacterModel;

        public Character()
        {
            Stats = new Stats();
        }

        public Character(string name, Genders gender)
        {
            Name = name;
            Gender = gender;
            Stats = new Stats();
        }

        /// <summary>
        /// Give an item to another character
        /// </summary>
        public void Give(Character target, Item item)
        {
            if (Inventory.Contains(item))
            {
                Inventory.Remove(item);
                target.Inventory.Add(item);
            }
        }

        /// <summary>
        /// Pay another character
        /// </summary>
        public void Pay(Character target, int amount)
        {
            // TODO: Implement currency system
            Debug.Log($"{Name} paid {target.Name} ${amount}");
        }
    }

    public enum Genders
    {
        Male,
        Female,
        NonBinary
    }

    /// <summary>
    /// Character stats
    /// </summary>
    [System.Serializable]
    public class Stats
    {
        public int Strength = 10;
        public int Endurance = 10;
        public int Speed = 10;
        public int Luck = 10;
        public int Charisma = 10;

        public int Health = 100;
        public int MaxHealth = 100;
        public int Stamina = 100;
        public int MaxStamina = 100;
    }
}
