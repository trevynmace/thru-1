using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Thru
{
    /// <summary>
    /// Draggable item for inventory system.
    /// Uses Unity's drag-and-drop event system.
    /// Replaces MonoGame's ItemIconDraggable.
    /// </summary>
    [RequireComponent(typeof(Image))]
    [RequireComponent(typeof(CanvasGroup))]
    public class DraggableItem : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler, IPointerClickHandler
    {
        [Header("Item Data")]
        public Item Item;
        public ItemDraggableGroup Group;

        [Header("Grid Position")]
        public Vector2Int ShapePosition; // Position within item shape (for multi-cell items)

        [Header("Visual Settings")]
        public Color normalColor = Color.white;
        public Color draggingColor = Color.red;
        public Color onBoardColor = new Color(0.8f, 0.6f, 1f); // Purple

        // State
        public InventoryState CurrentState { get; private set; } = InventoryState.FreeSpace;
        public bool IsDragging { get; private set; }
        public IDropZone CurrentDropZone { get; set; }

        // References
        private Image _image;
        private CanvasGroup _canvasGroup;
        private RectTransform _rectTransform;
        private Transform _originalParent;
        private Vector2 _originalPosition;
        private Canvas _canvas;

        private void Awake()
        {
            _image = GetComponent<Image>();
            _canvasGroup = GetComponent<CanvasGroup>();
            _rectTransform = GetComponent<RectTransform>();
            _canvas = GetComponentInParent<Canvas>();
        }

        /// <summary>
        /// Initialize the draggable item
        /// </summary>
        public void Initialize(Item item, ItemDraggableGroup group, Vector2Int shapePos, Sprite icon)
        {
            Item = item;
            Group = group;
            ShapePosition = shapePos;

            if (icon != null)
            {
                _image.sprite = icon;
            }

            UpdateVisuals();
        }

        #region Drag Handlers

        public void OnBeginDrag(PointerEventData eventData)
        {
            if (Group != null)
            {
                // Notify group that dragging started
                Group.OnBeginDrag(this);
            }

            IsDragging = true;
            _originalParent = transform.parent;
            _originalPosition = _rectTransform.anchoredPosition;

            // Move to top level so it renders above everything
            transform.SetParent(_canvas.transform, true);
            transform.SetAsLastSibling();

            // Allow raycasts to pass through while dragging
            _canvasGroup.blocksRaycasts = false;

            UpdateVisuals();
        }

        public void OnDrag(PointerEventData eventData)
        {
            // Move with mouse
            _rectTransform.anchoredPosition += eventData.delta / _canvas.scaleFactor;

            if (Group != null)
            {
                Group.OnDrag(this, eventData.delta / _canvas.scaleFactor);
            }
        }

        public void OnEndDrag(PointerEventData eventData)
        {
            IsDragging = false;
            _canvasGroup.blocksRaycasts = true;

            if (Group != null)
            {
                Group.OnEndDrag(this);
            }

            UpdateVisuals();
        }

        public void OnPointerClick(PointerEventData eventData)
        {
            // Right-click to rotate
            if (eventData.button == PointerEventData.InputButton.Right)
            {
                if (Group != null)
                {
                    Group.Rotate();
                }
            }
        }

        #endregion

        /// <summary>
        /// Move to a drop zone
        /// </summary>
        public void MoveToDropZone(IDropZone dropZone)
        {
            CurrentDropZone = dropZone;

            if (dropZone != null)
            {
                CurrentState = dropZone.DropZoneType;
                transform.SetParent(dropZone.Transform, false);
                _rectTransform.anchoredPosition = dropZone.GetDropPosition(this);
            }
            else
            {
                // Return to original position
                ReturnToOriginal();
            }

            UpdateVisuals();
        }

        /// <summary>
        /// Return to original position
        /// </summary>
        public void ReturnToOriginal()
        {
            CurrentState = InventoryState.FreeSpace;
            transform.SetParent(_originalParent, false);
            _rectTransform.anchoredPosition = _originalPosition;
        }

        /// <summary>
        /// Set the home position (free space location)
        /// </summary>
        public void SetHomePosition(Transform parent, Vector2 position)
        {
            _originalParent = parent;
            _originalPosition = position;
        }

        private void UpdateVisuals()
        {
            if (_image == null) return;

            if (IsDragging)
            {
                _image.color = draggingColor;
            }
            else if (CurrentState == InventoryState.InventoryBoard)
            {
                _image.color = onBoardColor;
            }
            else
            {
                _image.color = normalColor;
            }
        }
    }

    /// <summary>
    /// Interface for drop zones (inventory slots, equipment slots, etc.)
    /// </summary>
    public interface IDropZone
    {
        InventoryState DropZoneType { get; }
        Transform Transform { get; }
        bool CanAcceptItem(DraggableItem item);
        void OnItemDropped(DraggableItem item);
        void OnItemRemoved(DraggableItem item);
        Vector2 GetDropPosition(DraggableItem item);
    }
}
