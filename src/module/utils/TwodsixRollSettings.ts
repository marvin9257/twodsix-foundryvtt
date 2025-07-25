// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck This turns off *all* typechecking, make sure to remove this once foundry-vtt-types are updated to cover v10.

import {CE_DIFFICULTIES, CEL_DIFFICULTIES, TWODSIX} from "../config";
import type TwodsixItem from "../entities/TwodsixItem";
import {getDifficultiesSelectObject, getRollTypeSelectObject} from "./sheetUtils";
import { getKeyByValue } from "./utils";
import {DICE_ROLL_MODES} from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/constants.mjs";
import {Gear, Skills} from "../../types/template";
import TwodsixActor from "../entities/TwodsixActor";
import { simplifySkillName } from "./utils";
import { addSign, getCharacteristicFromDisplayLabel } from "./utils";
import { getTargetDMSelectObject } from "./targetModifiers";

export class TwodsixRollSettings {
  bonusDamage:string;
  difficulty:{ mod:number, target:number };
  //diceModifier:number;
  shouldRoll:boolean;
  rollType:string;
  rollMode:DICE_ROLL_MODES;
  //characteristic:string;
  skillRoll:boolean;
  itemRoll:boolean;
  itemName: string;
  showRangeModifier: boolean;
  showTargetModifier: boolean;
  showArmorWeaponModifier: boolean;
  difficulties:CE_DIFFICULTIES | CEL_DIFFICULTIES;
  displayLabel:string;
  extraFlavor:string;
  selectedTimeUnit:string;
  timeRollFormula:string;
  rollModifiers:Record<any, unknown>;
  skillName:string;
  flags:Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  constructor(settings?:Record<string,any>, aSkill?:TwodsixItem, anItem?:TwodsixItem, sourceActor?:TwodsixActor) {
    this.difficulties = settings?.difficulties ? settings.difficulties : TWODSIX.DIFFICULTIES[game.settings.get('twodsix', 'difficultyListUsed')];
    const skill = <Skills>aSkill?.system;
    let skillValue = 0;
    const difficulty = skill?.difficulty ? this.difficulties[skill.difficulty] : this.difficulties.Average;
    const gear = <Gear>anItem?.system;
    const itemName = anItem?.name ?? "";
    const characteristic = settings?.rollModifiers?.characteristic ?? (aSkill && game.settings.get('twodsix', 'ruleset') !== 'CT' ? skill.characteristic : "NONE");
    //Create Flag data for Automated Automations Module
    const itemUUID:string =  settings?.flags?.itemUUID ?? anItem?.uuid ?? aSkill?.uuid ?? "";
    const tokenUUID:string = settings?.flags?.tokenUUID ?? (<Actor>sourceActor)?.getActiveTokens()[0]?.document.uuid ?? "";
    const actorUUID:string = settings?.flags?.actorUUID ?? (<Actor>sourceActor)?.uuid ?? "";
    let rollClass = "";
    this.bonusDamage = settings?.bonusDamage ?? "";

    let woundsValue = 0;
    let encumberedValue = 0;
    let selectedActor = sourceActor;
    let displayLabel = "";
    if (aSkill && !selectedActor) {
      selectedActor = <TwodsixActor>aSkill.actor;
    } else if (anItem && !selectedActor) {
      selectedActor = <TwodsixActor>anItem.actor;
    }

    if (selectedActor) {
      if (selectedActor.type === 'ship') {
        displayLabel = characteristic;
      } else {
        //Determine active effects modifiers
        if (game.settings.get('twodsix', 'useWoundedStatusIndicators')) {
          woundsValue = (<TwodsixActor>selectedActor).system.conditions.woundedEffect ?? 0;
        }
        if (game.settings.get('twodsix', 'useEncumbranceStatusIndicators')) {
          const fullCharLabel = getKeyByValue(TWODSIX.CHARACTERISTICS, characteristic);
          encumberedValue = ["strength", "dexterity", "endurance"].includes(fullCharLabel) ? (<TwodsixActor>selectedActor).system.conditions.encumberedEffect ?? 0 : 0;
        }
        //Check for active effect override of skill
        if (aSkill) {
          skillValue = selectedActor.system.skills[simplifySkillName(aSkill.name)] ?? aSkill.system.value; //also need to ?? default? CONFIG.Item.dataModels.skills.schema.getInitialValue().value
        }

        //Check for "Untrained" value and use if better to account for JOAT
        const joat = (selectedActor.getUntrainedSkill()?.system)?.value ?? CONFIG.Item.dataModels.skills.schema.getInitialValue().value;
        if (joat > skillValue) {
          skillValue = joat;
          this.skillName = game.i18n.localize("TWODSIX.Actor.Skills.JOAT");
          //aSkill = selectedActor.getUntrainedSkill();
        } else {
          //skillValue = skill?.value;
          this.skillName = aSkill?.name ?? "?";
        }
        // check for missing display label
        if (!settings?.displayLabel) {
          const fullCharLabel:string = getKeyByValue(TWODSIX.CHARACTERISTICS, characteristic);
          displayLabel = selectedActor.system["characteristics"][fullCharLabel]?.displayShortLabel ?? "";
        }
      }

      //set Active Animation rollClass flag
      if (anItem) {
        if (anItem.type === "weapon") {
          rollClass = "Attack";
        } else if (anItem.type === "component") {
          if (anItem.system.subtype === "armament") {
            rollClass = "ShipWeapon";
          } else {
            rollClass = "ShipAction";
          } ////NEED TO EXPAND TYPES HERE to INCLUDE SP
        } else if (anItem.type === "spell") {
          rollClass = "Spell";
        } else if (anItem.type === "psiAbility") {
          rollClass = "PsionicAbility";
        } else {
          rollClass = "Item";
        }
      } else if (aSkill) {
        rollClass = "Skill";
      } else if (characteristic !== "NONE" && characteristic !== "") {
        rollClass = "Characteristic";
      } else {
        rollClass = "Unknown";
      }
    }

    this.difficulty = settings?.difficulty ?? difficulty;
    this.shouldRoll = false;
    this.rollType = settings?.rollType ?? (aSkill?.system)?.rolltype ??  "Normal";
    this.rollMode = settings?.rollMode ?? game.settings.get('core', 'rollMode');
    this.skillRoll = !!(settings?.skillRoll ?? aSkill);
    this.itemRoll = !!(anItem);
    this.isPsionicAbility = this.itemRoll ? anItem.type === "psiAbility" : false;
    this.itemName = settings?.itemName ?? itemName;
    this.showRangeModifier =  (game.settings.get('twodsix', 'rangeModifierType') !== 'none' && anItem?.type === "weapon"  && settings?.rollModifiers?.rangeLabel) ?? false;
    this.showTargetModifier = Object.keys(TWODSIX.TARGET_DM).length > 1;
    this.showArmorWeaponModifier = game.settings.get('twodsix', 'rangeModifierType') === 'CT_Bands' || game.settings.get('twodsix', 'ruleset') === 'CT';
    this.displayLabel = settings?.displayLabel ?? displayLabel;
    this.extraFlavor = settings?.extraFlavor ?? "";
    this.selectedTimeUnit = "none";
    this.timeRollFormula = "1d6";
    this.rollModifiers = {
      rof: settings?.rollModifiers?.rof ?? 0,
      characteristic: characteristic,
      wounds: woundsValue,
      skillValue: skillValue ?? 0,
      item: anItem?.type === "component" ? (parseInt(gear?.rollModifier, 10) || 0) : gear?.skillModifier ?? 0 ,  //need to check for component that uses rollModifier (needs a refactor)
      componentDamage: anItem?.type === "component" ? (gear?.hits * game.settings.get('twodsix', 'componentDamageDM') || 0) : 0 ,
      attachments: anItem?.system?.consumables?.length > 0 ? anItem?.getConsumableBonus("skillModifier") ?? 0 : 0,
      other: settings?.rollModifiers?.other ?? 0,
      encumbered: encumberedValue,
      dodgeParry: settings?.rollModifiers?.dodgeParry ?? 0,
      dodgeParryLabel: settings?.rollModifiers?.dodgeParryLabel ?? "",
      weaponsHandling: settings?.rollModifiers?.weaponsHandling ?? 0,
      weaponsRange: settings?.rollModifiers?.weaponsRange ?? 0,
      rangeLabel: settings?.rollModifiers?.rangeLabel ?? "",
      targetModifier: settings?.rollModifiers?.targetModifier?.length > 0 ? settings.rollModifiers.targetModifier : [],
      targetModifierOverride: settings?.rollModifiers?.targetModifierOverride ?? false,
      appliedEffects: {},
      chain: settings?.rollModifiers?.chain ?? 0,
      selectedSkill: aSkill?.uuid,
      skillLevelMax: settings?.rollModifiers?.skillLevelMax ?? undefined,
      armorModifier: settings?.rollModifiers?.armorModifier ?? 0,
      armorLabel: settings?.rollModifiers?.armorLabel ?? ""
    };
    this.flags = {
      rollClass: rollClass,
      tokenUUID: tokenUUID,
      itemUUID: itemUUID,
      actorUUID: actorUUID,
      bonusDamage: this.bonusDamage
    };
    //console.log("Modifiers: ", this.rollModifiers);
  }

  public static async create(showThrowDialog:boolean, settings?:Record<string,any>, skill?:TwodsixItem, item?:TwodsixItem, sourceActor?:TwodsixActor):Promise<TwodsixRollSettings> {
    const twodsixRollSettings = new TwodsixRollSettings(settings, skill, item, sourceActor);
    if (sourceActor) {
      twodsixRollSettings.rollModifiers.appliedEffects = getCustomModifiers(sourceActor, twodsixRollSettings.rollModifiers.characteristic, skill);
    }
    if (showThrowDialog) {
      let title:string;
      if (item && skill) {
        title = `${item.name} ${game.i18n.localize("TWODSIX.Actor.using")} ${twodsixRollSettings.skillName}`;
        twodsixRollSettings.itemName = item.name ?? "Unknown Item";
      } else if (skill) {
        title = twodsixRollSettings.skillName || "";
        //check for characteristic not on actor characteristic list
        if ( _getTranslatedCharacteristicList(<TwodsixActor>skill.actor)[(<string>twodsixRollSettings.rollModifiers.characteristic)] === undefined) {
          twodsixRollSettings.rollModifiers.characteristic = "NONE";
        }
      } else {
        title = twodsixRollSettings.displayLabel ?? "";
      }

      await twodsixRollSettings._throwDialog(title, skill);

      //Get display label
      if (skill && skill.actor) {
        if (twodsixRollSettings.rollModifiers.characteristic === "NONE") {
          twodsixRollSettings.displayLabel = "";
        } else {
          const fullCharLabel = getKeyByValue(TWODSIX.CHARACTERISTICS, twodsixRollSettings.rollModifiers.characteristic);
          twodsixRollSettings.displayLabel = sourceActor?.system["characteristics"][fullCharLabel]?.displayShortLabel ?? "";
        }
      } else if (skill) {
        twodsixRollSettings.displayLabel = ""; // for unattached skill roll
        twodsixRollSettings.rollModifiers.characteristic = "NONE";
      }

    } else {
      twodsixRollSettings.shouldRoll = true;
    }
    return twodsixRollSettings;
  }

  private async _throwDialog(title:string, skill?: TwodsixItem):Promise<void> {
    const template = 'systems/twodsix/templates/chat/throw-dialog.hbs';
    const dialogData = {
      rollType: this.rollType,
      rollTypes: getRollTypeSelectObject(),
      difficulty: getKeyByValue(this.difficulties, this.difficulty),
      difficultyList: getDifficultiesSelectObject(this.difficulties),
      skillsList: (<TwodsixActor>skill?.actor)?.getSkillNameList(),
      rollMode: this.rollMode,
      rollModes: CONFIG.Dice.rollModes,
      characteristicList: _getTranslatedCharacteristicList(<TwodsixActor>skill?.actor),
      initialChoice: this.rollModifiers.characteristic,
      initialSkill: this.rollModifiers.selectedSkill,
      rollModifiers: this.rollModifiers,
      skillLabel: this.skillName,
      itemLabel: this.itemName,
      showRangeModifier: this.showRangeModifier,
      showTargetModifier: this.showTargetModifier,
      showArmorWeaponModifier: this.showArmorWeaponModifier,
      armorModifier: this.rollModifiers.armorModifier,
      armorLabel: this.rollModifiers.armorLabel,
      targetModifier: this.rollModifiers.targetModifier,
      targetModifierOverride: this.rollModifiers.targetModifierOverride,
      targetDMList: getTargetDMSelectObject(),
      skillRoll: this.skillRoll,
      itemRoll: this.itemRoll,
      timeUnits: TWODSIX.TimeUnits,
      selectedTimeUnit: this.selectedTimeUnit,
      timeRollFormula: this.timeRollFormula,
      showConditions: (game.settings.get('twodsix', 'useWoundedStatusIndicators') || game.settings.get('twodsix', 'useEncumbranceStatusIndicators')),
      showWounds: game.settings.get('twodsix', 'useWoundedStatusIndicators'),
      showEncumbered: game.settings.get('twodsix', 'useEncumbranceStatusIndicators'),
      isPsionicAbility: this.isPsionicAbility,
      isComponent: ["ShipAction", "ShipWeapon"].includes(this.flags.rollClass)
    };

    const buttons = [
      {
        action: "ok",
        label: "TWODSIX.Rolls.Roll",
        icon: "fa-solid fa-dice",
        default: true,
        callback: (event, button, dialog) => {
          const formElements = dialog.element.querySelector(".standard-form").elements;
          this.shouldRoll = true;
          this.difficulty = this.difficulties[formElements["difficulty"]?.value];
          this.rollType = formElements["rollType"]?.value;
          this.rollMode = formElements["rollMode"]?.value;
          this.rollModifiers.chain = dialogData.skillRoll ? parseInt(formElements["rollModifiers.chain"]?.value || 0, 10) : this.rollModifiers.chain;
          this.rollModifiers.characteristic = dialogData.skillRoll ? formElements["rollModifiers.characteristic"]?.value : this.rollModifiers.characteristic;
          this.rollModifiers.item = dialogData.itemRoll ? parseInt(formElements["rollModifiers.item"]?.value || 0, 10) : this.rollModifiers.item;
          this.rollModifiers.componentDamage = dialogData.isComponent ? parseInt(formElements["rollModifiers.componentDamage"]?.value || 0, 10) : this.rollModifiers.componentDamage;
          this.rollModifiers.rof = (dialogData.itemRoll && dialogData.rollModifiers.rof) ? parseInt(formElements["rollModifiers.rof"]?.value || 0, 10) : this.rollModifiers.rof;
          this.rollModifiers.dodgeParry = (dialogData.itemRoll && dialogData.rollModifiers.dodgeParry) ? parseInt(formElements["rollModifiers.dodgeParry"]?.value || 0, 10) : this.rollModifiers.dodgeParry;
          this.rollModifiers.weaponsHandling = (dialogData.itemRoll && dialogData.rollModifiers.weaponsHandling) ? parseInt(formElements["rollModifiers.weaponsHandling"]?.value || 0, 10) : this.rollModifiers.weaponsHandling;
          this.rollModifiers.weaponsRange = (dialogData.showRangeModifier) ? parseInt(formElements["rollModifiers.weaponsRange"]?.value || 0, 10) : this.rollModifiers.weaponsRange;
          this.rollModifiers.attachments = (dialogData.itemRoll && dialogData.rollModifiers.attachments) ? parseInt(formElements["rollModifiers.attachments"]?.value || 0, 10) : this.rollModifiers.attachments;
          this.rollModifiers.other = parseInt(formElements["rollModifiers.other"].value || 0, 10);
          this.rollModifiers.wounds = dialogData.showWounds ? parseInt(formElements["rollModifiers.wounds"]?.value || 0, 10) : 0;
          this.rollModifiers.selectedSkill = dialogData.skillRoll ? formElements["rollModifiers.selectedSkill"]?.value: "";
          this.rollModifiers.targetModifier = (dialogData.showTargetModifier && formElements["rollModifiers.targetModifier"]) ? formElements["rollModifiers.targetModifier"].value : this.rollModifiers.targetModifier;
          this.rollModifiers.armorModifier  = (dialogData.showArmorWeaponModifier) ? parseInt(formElements["rollModifiers.armorModifier"]?.value || 0, 10) : 0;

          if(!dialogData.showEncumbered || !["strength", "dexterity", "endurance"].includes(getKeyByValue(TWODSIX.CHARACTERISTICS, this.rollModifiers.characteristic))) {
            //either dont show modifier or not a physical characteristic
            this.rollModifiers.encumbered = 0;
          } else {
            const dialogEncValue = parseInt(formElements["rollModifiers.encumbered"]?.value, 10);
            if (dialogData.initialChoice === this.rollModifiers.characteristic || dialogEncValue !== dialogData.rollModifiers.encumbered) {
              //characteristic didn't change or encumbrance modifer changed
              this.rollModifiers.encumbered = isNaN(dialogEncValue) ? 0 : dialogEncValue;
            } else {
              this.rollModifiers.encumbered = (<TwodsixActor>skill?.actor)?.system.conditions.encumberedEffect ?? (isNaN(dialogEncValue) ? 0 : dialogEncValue);
            }
          }

          this.selectedTimeUnit = formElements["timeUnit"]?.value;
          this.timeRollFormula = formElements["timeRollFormula"]?.value;
        }
      },
      {
        action: "cancel",
        icon: "fa-solid fa-xmark",
        label: "Cancel",
        callback: () => {
          this.shouldRoll = false;
        }
      },
    ];

    const html = await foundry.applications.handlebars.renderTemplate(template, dialogData);
    await foundry.applications.api.DialogV2.wait({
      window: {title: title, icon: "fa-solid fa-dice"},
      content: html,
      buttons: buttons,
      render: handleRender,
      close: () => {
        Promise.resolve();
      },
      rejectClose: false
    });
  }
}

function handleRender(ev:Event, htmlRend:DialogV2) {
  htmlRend.element.querySelector(".select-skill")?.addEventListener("change", () => {
    const characteristicElement = htmlRend.element.querySelector('[name="rollModifiers.characteristic"]');
    let newSkill:TwodsixItem;
    if (characteristicElement) {
      const newSkillUuid = htmlRend.element.querySelector('[name="rollModifiers.selectedSkill"]')?.value;
      if (newSkillUuid) {
        newSkill = fromUuidSync(newSkillUuid);
        characteristicElement.value = newSkill?.system.characteristic || "NONE";
      }
    }
    let newTitle = "";
    const titleElement = htmlRend.element.querySelector('.window-title');
    if (titleElement) {
      const usingWord = ' ' + game.i18n.localize("TWODSIX.Actor.using") + ' ';
      if (titleElement.innerText.includes(usingWord)) {
        newTitle = `${titleElement.innerText.substring(0, titleElement.innerText.indexOf(usingWord))}${usingWord}${newSkill?.name}`;
      } else {
        newTitle = newSkill?.name || "";
      }
      titleElement.innerText = newTitle;
    }
  });
}

export function _getTranslatedCharacteristicList(actor:TwodsixActor):object {
  const returnValue = {};
  if (actor) {
    returnValue["STR"] = getCharacteristicLabelWithMod(actor, "strength");
    returnValue["DEX"] = getCharacteristicLabelWithMod(actor, "dexterity");
    returnValue["END"] = getCharacteristicLabelWithMod(actor, "endurance");
    returnValue["INT"] = getCharacteristicLabelWithMod(actor, "intelligence");
    returnValue["EDU"] = getCharacteristicLabelWithMod(actor, "education");
    returnValue["SOC"] = getCharacteristicLabelWithMod(actor, "socialStanding");
    if (!['base', 'core'].includes(game.settings.get('twodsix', 'showAlternativeCharacteristics'))) {
      returnValue["ALT1"] = getCharacteristicLabelWithMod(actor, "alternative1");
      returnValue["ALT2"] =  getCharacteristicLabelWithMod(actor, "alternative2");
    }
    if (['all'].includes(game.settings.get('twodsix', 'showAlternativeCharacteristics'))) {
      returnValue["ALT3"] =  getCharacteristicLabelWithMod(actor, "alternative3");
    }
    if (!['alternate', 'core'].includes(game.settings.get('twodsix', 'showAlternativeCharacteristics'))) {
      returnValue["PSI"] =  getCharacteristicLabelWithMod(actor, "psionicStrength");
    }
  }
  returnValue["NONE"] =  "---";
  return returnValue;
}

export function getCharacteristicLabelWithMod(actor: TwodsixActor, characteristic: string) : string {
  return actor.system.characteristics[characteristic].displayShortLabel + '(' +
  (actor.system.characteristics[characteristic].mod >= 0 ? '+' : '') +
  actor.system.characteristics[characteristic].mod + ')';
}

export function _genUntranslatedCharacteristicList(): object {
  const returnValue = {};
  returnValue["STR"] = game.i18n.localize("TWODSIX.Items.Skills.STR");
  returnValue["DEX"] = game.i18n.localize("TWODSIX.Items.Skills.DEX");
  returnValue["END"] = game.i18n.localize("TWODSIX.Items.Skills.END");
  returnValue["INT"] = game.i18n.localize("TWODSIX.Items.Skills.INT");
  returnValue["EDU"] = game.i18n.localize("TWODSIX.Items.Skills.EDU");
  returnValue["SOC"] = game.i18n.localize("TWODSIX.Items.Skills.SOC");
  if (!['base', 'core'].includes(game.settings.get('twodsix', 'showAlternativeCharacteristics'))) {
    returnValue["ALT1"] = game.settings.get('twodsix', 'alternativeShort1');
    returnValue["ALT2"] = game.settings.get('twodsix', 'alternativeShort2');
  }
  if (['all'].includes(game.settings.get('twodsix', 'showAlternativeCharacteristics'))) {
    returnValue["ALT3"] = game.settings.get('twodsix', 'alternativeShort3');
  }
  if (!['alternate', 'core'].includes(game.settings.get('twodsix', 'showAlternativeCharacteristics'))) {
    returnValue["PSI"] = game.i18n.localize("TWODSIX.Items.Skills.PSI");
  }
  returnValue["NONE"] = "---";
  return returnValue;
}

export function getCharacteristicList(actor?:TwodsixActor|undefined): any {
  let returnValue = {};
  if (actor) {
    returnValue = _getTranslatedCharacteristicList(actor);
  } else {
    returnValue = _genUntranslatedCharacteristicList();
  }
  return returnValue;
}

export function getCustomModifiers(selectedActor:TwodsixActor, characteristic:string, skill?:Skills): Promise<any> {
  const characteristicKey = getKeyByValue(TWODSIX.CHARACTERISTICS, characteristic);
  const simpleSkillRef = skill ? `system.skills.` + simplifySkillName(skill.name) : ``;
  const returnObject = [];
  const customEffects = selectedActor.appliedEffects.filter(eff  => !eff.statuses.has('encumbered') && !eff.statuses.has('wounded'));
  for (const effect of customEffects) {
    for (const change of effect.changes) {
      if (change.key === `system.characteristics.${characteristicKey}.mod` || change.key === `system.characteristics.${characteristicKey}.value` || (change.key === simpleSkillRef) && simpleSkillRef) {
        returnObject.push({
          name: effect.name,
          stat: change.key.replace('system.', ''),
          value: addSign(change.value)
        });
      }
    }
  }
  return returnObject;
}

/**
 * Returns initial roll settings based on a coded string for a roll formula
 * @param {string} parseString A string of roll parameters.  It has the format 'Skill 1 | Skill 2/Char1 | Char 2 Difficulty+ =Item Id'
 * e.g. 'Engineering|Mechanic/INT|EDU 6+'.  For a characteristic Roll, use 'None' instead of a skill name.
 * @param {TwodsixActor} actor The actor that posesses the skill
 * @returns {TwodsixRollSettings | any} an object of the initial RollSettings
 */
export function getInitialSettingsFromFormula(parseString: string, actor: TwodsixActor): TwodsixRollSettings|any {
  const difficulties = TWODSIX.DIFFICULTIES[game.settings.get('twodsix', 'difficultyListUsed')];
  // eslint-disable-next-line no-useless-escape
  const re = new RegExp(/^(.[^\/\+=]*?) ?(?:\/([\S]+))? ?(?:(\d{0,2})\+)? ?(?:=(\w*))? ?$/);
  const parsedResult: RegExpMatchArray | null = re.exec(parseString);

  if (parsedResult !== null) {
    const [, parsedSkills, char, diff] = parsedResult;

    // Set difficulty
    let difficulty: string|undefined = undefined;
    let otherMod = 0;
    if (diff) {
      let diffSelected = parseInt(diff, 10);
      // Adjust for odd difficulty values
      otherMod = diffSelected % 2 ? 1 : 0;
      diffSelected += diffSelected % 2;
      difficulty = Object.values(difficulties).find((dif: Record<string, number>) => dif.target === diffSelected);
    }

    // Select Skill if required
    let skill:TwodsixItem|undefined = undefined;
    if (parsedSkills !== "" && parsedSkills !== 'None') {
      skill = actor.getBestSkill(parsedSkills, !char);
      if (!skill) {
        ui.notifications.error(game.i18n.localize("TWODSIX.Ship.ActorLacksSkill").replace("_ACTOR_NAME_", actor.name ?? "").replace("_SKILL_", parsedSkills));
        return false;
      }
    }

    // get characteristic key (displayLabelShort), default to skill key if none specificed in formula
    let characteristicKey = "";
    const charObject = actor?.system["characteristics"] ?? {};
    //we need an array
    const charObjectArray = Object.values(charObject);
    if(!char && skill) {
      //Try to get characteristic key from skill
      characteristicKey = getKeyByValue(TWODSIX.CHARACTERISTICS, (<Skills>skill.system).characteristic);
    } else if (char) {
      //find the most advantageous characteristic to use based on the displayed (custom) short label
      const charOptions = char.split("|").map(str => str.trim());
      let candidateCharObject = undefined;
      const candidateCharObjects = charObjectArray.filter(ch => charOptions.includes(ch.displayShortLabel) || charOptions.includes(ch.shortLabel));
      if(candidateCharObjects.length > 0){
        candidateCharObject = candidateCharObjects.reduce((prev, current) =>(prev.mod > current.mod) ? prev: current);
      }
      characteristicKey = candidateCharObject?.key ?? getCharacteristicFromDisplayLabel(char, actor);
    }

    let shortLabel = "NONE";
    let displayLabel = "NONE";
    if (charObject && characteristicKey) {
      shortLabel = charObject[characteristicKey].shortLabel;
      displayLabel = charObject[characteristicKey].displayShortLabel;
    }

    const returnValues = {
      skill: skill,
      skillRoll: parsedSkills === 'None' ? false : !!skill,
      displayLabel: displayLabel,
      rollModifiers: {
        characteristic: shortLabel,
        other: otherMod}
    };
    if (diff) {
      returnValues["difficulty"] = difficulty;
    }
    return returnValues;
  } else {
    ui.notifications.error("TWODSIX.Ship.CannotParseArgument", {localize: true});
    return false;
  }
}
