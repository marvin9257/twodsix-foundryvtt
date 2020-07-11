/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */


export class TwodsixActorSheet extends ActorSheet {

    /** @override */
    static get defaultOptions():FormApplicationOptions {
        return mergeObject(super.defaultOptions, {
            classes: ["twodsix", "sheet", "actor"],
            template: "systems/twodsix/templates/actors/actor-sheet.html",
            width: 600,
            height: 600,
        });
    }

    /* -------------------------------------------- */

    /** @override */
    protected activateListeners(html: JQuery<HTMLElement>):void {
        super.activateListeners(html);

        // Everything below here is only needed if the sheet is editable
        if (!this.options.editable) return;

        // Submit when changing the state of checkboxes
        html.find('input[type="checkbox"]').on('change', (ev) =>
            this._onSubmit(ev)
        );

        // Rollable abilities.
        html.find('.rollable').click((function (event):void {
            event.preventDefault();
            const element = event.currentTarget;
            const {dataset} = element;

            if (dataset.roll) {
                const roll = new Roll(dataset.roll, this.actor.data.data);
                const label = dataset.label ? `Rolling ${dataset.label}` : '';
                roll.roll().toMessage({
                    speaker: ChatMessage.getSpeaker({actor: this.actor}),
                    flavor: label
                });
            }
        }).bind(this));
    }
}
