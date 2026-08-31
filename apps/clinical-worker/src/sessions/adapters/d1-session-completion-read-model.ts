import type { D1DatabaseLike } from '../../../../../libs/database/src/d1/d1.types.js';
import type { SessionCompletionFacts, SessionCompletionReadModelPort } from '../ports/session-completion-read-model.port.js';

type CountRow={count:number};
export class D1SessionCompletionReadModel implements SessionCompletionReadModelPort {
  constructor(private readonly db:D1DatabaseLike) {}
  async getFacts(t:string,s:string):Promise<SessionCompletionFacts|null> {
    const session=await this.db.prepare('SELECT status, completion_requirements_json, service_id FROM sessions WHERE tenant_id = ? AND id = ?').bind(t,s).first<any>();
    if(!session)return null;
    const service=await this.db.prepare('SELECT requires_equipment, requires_photography, has_technical_form, technical_requirements_json FROM services WHERE tenant_id = ? AND id = ?').bind(t,session.service_id).first<any>();
    const configured=service?.technical_requirements_json?JSON.parse(service.technical_requirements_json):{};
    const snapshot=session.completion_requirements_json?JSON.parse(session.completion_requirements_json):undefined;
    const technical=snapshot?.requiresTechnicalForm??Boolean(service?.has_technical_form);
    const power=snapshot?.requiresPower??Boolean(configured.requiresPower);
    const equipment=snapshot?.requiresEquipment??Boolean(service?.requires_equipment);
    const photo=snapshot?.requiresPhotography??Boolean(service?.requires_photography);
    const missing:CountRow|null=technical?await this.db.prepare("SELECT COUNT(*) AS count FROM session_technical_field_snapshots f LEFT JOIN session_technical_values v ON v.tenant_id = f.tenant_id AND v.session_id = ? AND v.field_snapshot_id = f.id WHERE f.tenant_id = ? AND f.snapshot_id = (SELECT id FROM session_technical_form_snapshots WHERE tenant_id = ? AND session_id = ?) AND f.required = 1 AND v.id IS NULL").bind(s,t,t,s).first<CountRow>():null;
    const powerCount:CountRow|null=power?await this.db.prepare('SELECT COUNT(*) AS count FROM session_power_records WHERE tenant_id = ? AND session_id = ?').bind(t,s).first<CountRow>():null;
    const equipmentCount:CountRow|null=equipment?await this.db.prepare('SELECT COUNT(*) AS count FROM session_equipment_usage WHERE tenant_id = ? AND session_id = ?').bind(t,s).first<CountRow>():null;
    const photoCount:CountRow|null=photo?await this.db.prepare("SELECT COUNT(*) AS count FROM clinical_photo_attachments WHERE tenant_id = ? AND session_id = ? AND purpose IN ('BEFORE','DURING','AFTER') AND status = 'AVAILABLE'").bind(t,s).first<CountRow>():null;
    const inter=await this.db.prepare("SELECT COUNT(*) AS count FROM intercurrences WHERE tenant_id = ? AND session_id = ? AND status = 'OPEN'").bind(t,s).first<CountRow>();
    const variation=await this.db.prepare("SELECT COUNT(*) AS count FROM session_variation_alerts WHERE tenant_id = ? AND session_id = ? AND status = 'OPEN'").bind(t,s).first<CountRow>();
    return {inProgress:session.status==='IN_PROGRESS',technicalRequired:technical,technicalComplete:!technical||Number(missing?.count??0)===0,powerRequired:power,powerSatisfied:!power||Number(powerCount?.count??0)>0,equipmentRequired:equipment,equipmentSatisfied:!equipment||Number(equipmentCount?.count??0)>0,photoRequired:photo,photoSatisfied:!photo||Number(photoCount?.count??0)>0,openIntercurrencesCount:Number(inter?.count??0),openVariationAlertsCount:Number(variation?.count??0)};
  }
}
