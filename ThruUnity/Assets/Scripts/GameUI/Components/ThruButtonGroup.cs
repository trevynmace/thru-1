using System.Collections.Generic;
using UnityEngine;

namespace Thru
{
    /// <summary>
    /// Arranges buttons in a vertical or horizontal layout.
    /// Replaces MonoGame's ButtonGroup.
    ///
    /// Note: Unity has built-in VerticalLayoutGroup and HorizontalLayoutGroup
    /// that you can use instead. This component provides the same API as
    /// the MonoGame version for easier porting.
    /// </summary>
    public class ThruButtonGroup : MonoBehaviour
    {
        [Header("Layout Settings")]
        public ButtonArrangement arrangement = ButtonArrangement.Vertical;

        [Tooltip("Spacing between buttons in pixels")]
        public float spacing = 10f;

        [Header("Buttons")]
        [Tooltip("Buttons to manage - will auto-populate from children if empty")]
        public List<ThruButton> buttons = new List<ThruButton>();

        private RectTransform _rectTransform;

        private void Awake()
        {
            _rectTransform = GetComponent<RectTransform>();

            // Auto-populate from children if list is empty
            if (buttons.Count == 0)
            {
                buttons.AddRange(GetComponentsInChildren<ThruButton>());
            }
        }

        private void Start()
        {
            UpdatePositions();
        }

        /// <summary>
        /// Update button positions based on arrangement
        /// </summary>
        public void UpdatePositions()
        {
            if (buttons == null || buttons.Count == 0)
                return;

            Vector2 currentPos = Vector2.zero;

            if (arrangement == ButtonArrangement.Vertical)
            {
                foreach (var button in buttons)
                {
                    if (button == null) continue;

                    var buttonRect = button.GetComponent<RectTransform>();
                    if (buttonRect == null) continue;

                    // Set anchored position (relative to parent)
                    buttonRect.anchoredPosition = currentPos;

                    // Move down for next button
                    currentPos.y -= buttonRect.sizeDelta.y + spacing;
                }
            }
            else // Horizontal
            {
                foreach (var button in buttons)
                {
                    if (button == null) continue;

                    var buttonRect = button.GetComponent<RectTransform>();
                    if (buttonRect == null) continue;

                    // Set anchored position
                    buttonRect.anchoredPosition = currentPos;

                    // Move right for next button
                    currentPos.x += buttonRect.sizeDelta.x + spacing;
                }
            }
        }

        /// <summary>
        /// Add a button to the group
        /// </summary>
        public void AddButton(ThruButton button)
        {
            if (button == null) return;

            buttons.Add(button);

            // Re-parent to this group
            button.transform.SetParent(transform, false);

            UpdatePositions();
        }

        /// <summary>
        /// Remove a button from the group
        /// </summary>
        public void RemoveButton(ThruButton button)
        {
            if (button == null) return;

            buttons.Remove(button);
            UpdatePositions();
        }

        /// <summary>
        /// Get a button by index
        /// </summary>
        public ThruButton GetButton(int index)
        {
            if (index >= 0 && index < buttons.Count)
            {
                return buttons[index];
            }
            return null;
        }

        /// <summary>
        /// Get a button by ID
        /// </summary>
        public ThruButton GetButtonById(string id)
        {
            return buttons.Find(b => b.buttonId == id);
        }

        /// <summary>
        /// Check if any button was just released (for polling in Update)
        /// </summary>
        public ThruButton GetJustReleasedButton()
        {
            return buttons.Find(b => b.State == ButtonState.JustReleased);
        }

#if UNITY_EDITOR
        /// <summary>
        /// Editor helper to refresh layout
        /// </summary>
        [ContextMenu("Update Positions")]
        private void EditorUpdatePositions()
        {
            buttons.Clear();
            buttons.AddRange(GetComponentsInChildren<ThruButton>());
            UpdatePositions();
        }
#endif
    }
}
