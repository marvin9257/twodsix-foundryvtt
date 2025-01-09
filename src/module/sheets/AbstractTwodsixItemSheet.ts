// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck This turns off *all* typechecking, make sure to remove this once foundry-vtt-types are updated to cover v10.
import { TWODSIX } from "../config";
import { getDataFromDropEvent, getItemFromDropData, isDisplayableSkill } from "../utils/sheetUtils";
import { sortByItemName } from "../utils/utils";

/**
 * Extend the basic ItemSheetV2 with some very simple modifications
 * @extends {ItemSheetV2}
 */
export abstract class AbstractTwodsixItemSheet extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.sheets.ItemSheetV2) {

  public async _onRender(context:any, options: any):void {
    await super._onRender(context, options);
    //need to create DragDrop listener as none in core
    if (game.user.isOwner && this.options.dragDrop) {
      (<object[]>this.options.dragDrop).forEach( (selector:{dragSelector: string, dropSelector:string}) => {
        new DragDrop({
          dragSelector: selector.dragSelector,
          dropSelector: selector.dropSelector,
          callbacks: {
            dragstart: this._onDragStart.bind(this),
            dragover: this._onDragOver.bind(this),
            drop: this._onDrop.bind(this)
          }
        }).bind(this.element);
      });
    }
  }

  async _prepareContext(options):any {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system; //convenience access to item.system data
    context.owner = this.actor;
    if (this.actor){
      //build Skills Pick List
      const skillsList: TwodsixItem[] = [];
      for (const skill of context.owner.itemTypes.skills) {
        if (isDisplayableSkill(<TwodsixItem>skill) || (skill.getFlag("twodsix", "untrainedSkill") === game.settings.get('twodsix', 'hideUntrainedSkills'))) {
          skillsList.push(<TwodsixItem>skill);
        }
      }
      context.skillsList = sortByItemName(skillsList);
    }
    return context;
  }

  /*******************
   *
   * Drag Drop Handling
   *
   * Code mainly from core
   *******************/


  /** The following pieces set up drag handling and are unlikely to need modification  */

  /** @override */
  _canDragDrop(/*selector*/) {
    //console.log("got to drop check", selector);
    return this.isEditable;
  }

  /**
   * Define whether a user is able to begin a dragstart workflow for a given drag selector
   * @param {string} selector       The candidate HTML selector for dragging
   * @returns {boolean}             Can the current user drag this selector?
   * @protected
   */
  _canDragStart(/*selector*/) {
    //console.log("got to start", selector);
    return this.isEditable;
  }

  /**
   * An event that occurs when a drag workflow begins for a draggable item on the sheet.
   * @param {DragEvent} event       The initiating drag start event
   * @returns {Promise<void>}
   * @protected
   */
  _onDragStart(ev:DragEvent):void {
    const li = ev.currentTarget.closest('.item');
    if (li?.dataset) {
      if ( "link" in event.target.dataset ) {
        return;
      }
      let dragData:any;

      // Owned Items
      if ( li.dataset.itemId ) {
        const item = this.actor.items.get(li.dataset.itemId);
        dragData = item.toDragData();
      }

      // Active Effect
      if ( li.dataset.effectId ) {
        const effect = this.actor.effects.get(li.dataset.effectId);
        dragData = effect.toDragData();
      }

      // Set data transfer
      if ( !dragData ) {
        return;
      }
      event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
    }
  }

  /**
   * An event that occurs when a drag workflow moves over a drop target.
   * @param {DragEvent} event
   * @protected
   */
  _onDragOver(/*ev:DragEvent*/) {
  }

  /**
   * Callback actions which occur when dropping.  TWODSIX Specific!
   * @param {DragEvent} ev The originating DragEvent
   */
  async _onDrop(ev: DragEvent): Promise<boolean | any> {
    ev.preventDefault();
    try {
      const dropData = getDataFromDropEvent(ev);
      this.check(!dropData, "DraggingSomething");
      if (['html', 'pdf'].includes(dropData.type)){
        if (dropData.href) {
          await this.item.update({
            "system.pdfReference.type": dropData.type,
            "system.pdfReference.href": dropData.href,
            "system.pdfReference.label": dropData.label
          });
        }
      } else if (['JournalEntry', 'JournalEntryPage'].includes(dropData.type)) {
        const journalEntry = await fromUuid(dropData.uuid);
        if (journalEntry) {
          await this.item.update({
            "system.pdfReference.type": 'JournalEntry',
            "system.pdfReference.href": dropData.uuid,
            "system.pdfReference.label": journalEntry.name
          });
        }
      } else if (dropData.type === 'Item'){
        //This part handles just comsumables
        this.check(!this.item.isOwned, "OnlyOwnedItems");
        this.check(TWODSIX.WeightlessItems.includes(this.item.type), "TraitsandSkillsNoConsumables");

        this.check(dropData.type !== "Item", "OnlyDropItems");

        const itemData = await getItemFromDropData(dropData);

        this.check(itemData.type !== "consumable", "OnlyDropConsumables");
        this.check(this.item.type === "consumable" && itemData.system.isAttachment, "CantDropAttachOnConsumables");

        // If the dropped item has the same actor as the current item let's just use the same id.
        let itemId: string;
        if (this.item.actor?.items.get(itemData._id)) {
          itemId = itemData._id;
        } else {
          const newItem = await (<TwodsixActor>this.item.actor)?.createEmbeddedDocuments("Item", [foundry.utils.duplicate(itemData)]);
          if (!newItem) {
            throw new Error(`Somehow could not create item ${itemData}`);
          }
          itemId = newItem[0].id;
        }
        await (<TwodsixItem>this.item).addConsumable(itemId);
      }
      this.render();
    } catch (err) {
      console.error(`Twodsix drop error| ${err}`);
      ui.notifications.error(err);
    }
  }

  private check(cond: boolean, err: string) {
    if (cond) {
      throw new Error(game.i18n.localize(`TWODSIX.Errors.${err}`));
    }
  }
}

export function onPasteStripFormatting(event): void {
  if (event.originalEvent && event.originalEvent.clipboardData && event.originalEvent.clipboardData.getData) {
    event.preventDefault();
    const text = event.originalEvent.clipboardData.getData('text/plain');
    window.document.execCommand('insertText', false, text);
  } else if (event.clipboardData && event.clipboardData.getData) {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    window.document.execCommand('insertText', false, text);
  }
}
