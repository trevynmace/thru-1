using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using TMPro;

namespace Thru
{
    /// <summary>
    /// Equipment slot where items can be equipped.
    /// Replaces MonoGame's EquipmentReceiver.
    /// </summary>
    [RequireComponent(typeof(Image))]
    public class EquipmentSlot : MonoBehaviour, IDropHandler, IPointerEnterHandler, IPointerExitHandler, IDropZone
    {
        [Header("Slot Settings")]
        public ItemSlot slotType = ItemSlot.None;
        public string slotName;

        [Header("Visual")]
        public Color emptyColor = Color.black;
        public Color hoverColor = Color.red;
        public Color occupiedColor = new Color(0, 0.5f, 0);
        public TextMeshProUGUI labelText;

        // State
        public Item EquippedItem { get; private set; }
        public DraggableItem EquippedDraggable { get; private set; }
        public bool IsOccupied => EquippedItem != null;

        // IDropZone implementation
        public InventoryState DropZoneType => InventoryState.Equipment;
        public Transform Transform => transform;

        private Image _image;
        private RectTransform _rectTransform;

        private void Awake()
        {
            _image = GetComponent<Image>();
            _rectTransform = GetComponent<RectTransform>();

            if (string.IsNullOrEmpty(slotName))
                slotName = slotType.ToString();

            UpdateVisual();
            UpdateLabel();
        }

        public void OnDrop(PointerEventData eventData)
        {
            var draggable = eventData.pointerDrag?.GetComponent<DraggableItem>();
            if (draggable == null) return;

            // Check if item can be equipped in this slot
            if (!CanAcceptItem(draggable))
            {
                Debug.Log($"Item {draggable.Item?.Name} cannot be equipped in {slotType} slot");
                return;
            }

            // Unequip current item if any
            if (IsOccupied)
            {
                Unequip();
            }

            // Equip new item
            Equip(draggable);
        }

        public void OnPointerEnter(PointerEventData eventData)
        {
            if (!IsOccupied)
                _image.color = hoverColor;
        }

        public void OnPointerExit(PointerEventData eventData)
        {
            UpdateVisual();
        }

        /// <summary>
        /// Check if item can be equipped in this slot
        /// </summary>
        public bool CanAcceptItem(DraggableItem item)
        {
            if (item == null || item.Item == null) return false;

            // Check if item's slot type matches this slot
            return item.Item.Slot == slotType || slotType == ItemSlot.None;
        }

        /// <summary>
        /// Equip an item to this slot
        /// </summary>
        public void Equip(DraggableItem draggable)
        {
            EquippedItem = draggable.Item;
            EquippedDraggable = draggable;

            draggable.MoveToDropZone(this);

            if (draggable.Group != null)
            {
                draggable.Group.Equip(this);
            }

            UpdateVisual();

            Debug.Log($"Equipped {EquippedItem.Name} to {slotType}");
        }

        /// <summary>
        /// Unequip current item
        /// </summary>
        public void Unequip()
        {
            if (EquippedDraggable != null)
            {
                EquippedDraggable.ReturnToOriginal();

                if (EquippedDraggable.Group != null)
                {
                    EquippedDraggable.Group.ReturnHome();
                }
            }

            var oldItem = EquippedItem;
            EquippedItem = null;
            EquippedDraggable = null;

            UpdateVisual();

            if (oldItem != null)
                Debug.Log($"Unequipped {oldItem.Name} from {slotType}");
        }

        private void UpdateVisual()
        {
            _image.color = IsOccupied ? occupiedColor : emptyColor;
        }

        private void UpdateLabel()
        {
            if (labelText != null)
            {
                labelText.text = slotName;
            }
        }

        #region IDropZone Implementation

        public void OnItemDropped(DraggableItem item)
        {
            Equip(item);
        }

        public void OnItemRemoved(DraggableItem item)
        {
            if (EquippedDraggable == item)
            {
                EquippedItem = null;
                EquippedDraggable = null;
                UpdateVisual();
            }
        }

        public Vector2 GetDropPosition(DraggableItem item)
        {
            // Return center of slot
            return Vector2.zero;
        }

        #endregion
    }
}
