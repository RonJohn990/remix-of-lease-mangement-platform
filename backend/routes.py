"""
Data CRUD routes (/api/*) and Compute routes (/api/compute/*)
"""

import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from .app import (
    db, CorporateGroup, Entity, Lease, Profile, UserRole,
    UserEntityAssignment, LeaseType, AssetLocation, WorkflowRole,
    gen_uuid, utcnow
)
from . import computations as comp_engine

data_bp = Blueprint('data', __name__)
compute_bp = Blueprint('compute', __name__)


def _is_admin(user_id: str) -> bool:
    return UserRole.query.filter_by(user_id=user_id, role='admin').first() is not None


def require_admin(f):
    from functools import wraps
    @wraps(f)
    @jwt_required()
    def decorated(*args, **kwargs):
        uid = get_jwt_identity()
        if not _is_admin(uid):
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# Corporate Groups
# ---------------------------------------------------------------------------

@data_bp.route('/groups', methods=['GET'])
@jwt_required()
def get_groups():
    rows = CorporateGroup.query.order_by(CorporateGroup.created_at).all()
    return jsonify([r.to_dict() for r in rows])


@data_bp.route('/groups', methods=['POST'])
@jwt_required()
def save_group():
    body = request.get_json(silent=True) or {}
    cid = body.get('corporate_id') or gen_uuid()
    existing = CorporateGroup.query.get(cid)
    if existing:
        existing.corporate_group_name = body['corporate_group_name']
    else:
        existing = CorporateGroup(
            corporate_id=cid,
            corporate_group_name=body['corporate_group_name'],
        )
        db.session.add(existing)
    db.session.commit()
    return jsonify({'corporate_id': existing.corporate_id})


@data_bp.route('/groups/<group_id>', methods=['DELETE'])
@jwt_required()
def delete_group(group_id):
    g = CorporateGroup.query.get(group_id)
    if not g:
        return jsonify({'error': 'Not found'}), 404
    # Cascade: delete entities and leases via FK constraint (or manually)
    entities = Entity.query.filter_by(corporate_id=group_id).all()
    for e in entities:
        Lease.query.filter_by(entity_id=e.entity_id).delete()
    Entity.query.filter_by(corporate_id=group_id).delete()
    UserEntityAssignment.query.filter_by(corporate_id=group_id).delete()
    db.session.delete(g)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Entities
# ---------------------------------------------------------------------------

@data_bp.route('/entities', methods=['GET'])
@jwt_required()
def get_entities():
    corporate_id = request.args.get('corporate_id')
    q = Entity.query.order_by(Entity.created_at)
    if corporate_id:
        q = q.filter_by(corporate_id=corporate_id)
    return jsonify([r.to_dict() for r in q.all()])


@data_bp.route('/entities', methods=['POST'])
@jwt_required()
def save_entity():
    body = request.get_json(silent=True) or {}
    eid = body.get('entity_id') or gen_uuid()
    existing = Entity.query.get(eid)
    if existing:
        existing.corporate_id = body.get('corporate_id', existing.corporate_id)
        existing.legal_entity_name = body.get('legal_entity_name', existing.legal_entity_name)
        existing.address = body.get('address', existing.address)
        existing.location = body.get('location', existing.location)
        existing.pin_code = body.get('pin_code', existing.pin_code)
        existing.financial_year_start = body.get('financial_year_start', existing.financial_year_start)
        existing.financial_year_end = body.get('financial_year_end', existing.financial_year_end)
    else:
        existing = Entity(
            entity_id=eid,
            corporate_id=body['corporate_id'],
            legal_entity_name=body.get('legal_entity_name', ''),
            address=body.get('address', ''),
            location=body.get('location', ''),
            pin_code=body.get('pin_code', ''),
            financial_year_start=body.get('financial_year_start', '04-01'),
            financial_year_end=body.get('financial_year_end', '03-31'),
        )
        db.session.add(existing)
    db.session.commit()
    return jsonify({'entity_id': existing.entity_id})


@data_bp.route('/entities/<entity_id>', methods=['DELETE'])
@jwt_required()
def delete_entity(entity_id):
    e = Entity.query.get(entity_id)
    if not e:
        return jsonify({'error': 'Not found'}), 404
    Lease.query.filter_by(entity_id=entity_id).delete()
    UserEntityAssignment.query.filter_by(entity_id=entity_id).delete()
    db.session.delete(e)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Leases
# ---------------------------------------------------------------------------

@data_bp.route('/leases', methods=['GET'])
@jwt_required()
def get_leases():
    entity_id = request.args.get('entity_id')
    q = Lease.query.order_by(Lease.created_at)
    if entity_id:
        q = q.filter_by(entity_id=entity_id)
    return jsonify([r.to_dict() for r in q.all()])


@data_bp.route('/leases/<lease_id>', methods=['GET'])
@jwt_required()
def get_lease(lease_id):
    l = Lease.query.get(lease_id)
    if not l:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(l.to_dict())


@data_bp.route('/leases', methods=['POST'])
@jwt_required()
def save_lease():
    body = request.get_json(silent=True) or {}
    lid = body.get('lease_id') or gen_uuid()
    existing = Lease.query.get(lid)
    fields = [
        'entity_id', 'legal_entity_name', 'lease_version', 'lease_event',
        'lease_name', 'vendor_name', 'tagged_employee', 'asset_unit',
        'concerned_person', 'lease_comments', 'payment_frequency', 'payment_timing',
        'lease_type', 'lease_classification', 'lease_start_date', 'lease_end_date',
        'rent_commencement_date', 'discount_rate_ibr', 'monthly_lease_amount',
        'number_installments', 'security_deposit', 'initial_direct_cost',
        'short_term_flag', 'low_value_flag', 'status',
    ]
    if existing:
        for f in fields:
            if f in body:
                setattr(existing, f, body[f])
        if 'escalations' in body:
            existing.escalations = json.dumps(body['escalations'])
        if 'modifications' in body:
            existing.modifications = json.dumps(body['modifications'])
    else:
        existing = Lease(
            lease_id=lid,
            entity_id=body.get('entity_id', ''),
            lease_name=body.get('lease_name', ''),
        )
        for f in fields:
            if f in body and f not in ('entity_id', 'lease_name'):
                setattr(existing, f, body[f])
        existing.escalations = json.dumps(body.get('escalations', []))
        existing.modifications = json.dumps(body.get('modifications', []))
        db.session.add(existing)
    db.session.commit()
    return jsonify({'lease_id': existing.lease_id})


@data_bp.route('/leases/<lease_id>', methods=['DELETE'])
@jwt_required()
def delete_lease(lease_id):
    l = Lease.query.get(lease_id)
    if not l:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(l)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Users (admin only)
# ---------------------------------------------------------------------------

@data_bp.route('/profiles', methods=['GET'])
@jwt_required()
def get_profiles():
    """Return all user profiles (for admin user management)."""
    profiles = Profile.query.order_by(Profile.created_at).all()
    return jsonify([p.to_dict() for p in profiles])


@data_bp.route('/users', methods=['POST'])
@jwt_required()
def create_user():
    """Admin creates a new user with role."""
    caller_id = get_jwt_identity()
    if not _is_admin(caller_id):
        return jsonify({'error': 'Admin access required'}), 403

    body = request.get_json(silent=True) or {}
    email = (body.get('email') or '').strip()
    password = body.get('password') or ''
    full_name = (body.get('full_name') or '').strip()
    role = body.get('role') or 'viewer'

    if not email or not password or not full_name:
        return jsonify({'error': 'email, password and full_name are required'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Password must be at least 8 characters'}), 400
    if role not in ('admin', 'lease_creator', 'viewer'):
        return jsonify({'error': 'Invalid role'}), 400
    if Profile.query.filter_by(email=email).first():
        return jsonify({'error': 'A user with this email already exists'}), 400

    from werkzeug.security import generate_password_hash
    profile = Profile(
        email=email,
        full_name=full_name,
        password_hash=generate_password_hash(password),
    )
    db.session.add(profile)
    db.session.flush()
    db.session.add(UserRole(user_id=profile.user_id, role=role))
    db.session.commit()

    return jsonify({'success': True, 'user_id': profile.user_id})


@data_bp.route('/users/roles', methods=['GET'])
@jwt_required()
def get_user_roles():
    rows = UserRole.query.all()
    return jsonify([{'id': r.id, 'user_id': r.user_id, 'role': r.role} for r in rows])


@data_bp.route('/users/<user_id>/role', methods=['PUT'])
@jwt_required()
def update_user_role(user_id):
    caller_id = get_jwt_identity()
    if not _is_admin(caller_id):
        return jsonify({'error': 'Admin access required'}), 403
    body = request.get_json(silent=True) or {}
    role = body.get('role')
    if role not in ('admin', 'lease_creator', 'viewer'):
        return jsonify({'error': 'Invalid role'}), 400
    UserRole.query.filter_by(user_id=user_id).delete()
    db.session.add(UserRole(user_id=user_id, role=role))
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# User Entity Assignments
# ---------------------------------------------------------------------------

@data_bp.route('/assignments', methods=['GET'])
@jwt_required()
def get_assignments():
    rows = UserEntityAssignment.query.all()
    return jsonify([{
        'id': r.id,
        'user_id': r.user_id,
        'corporate_id': r.corporate_id,
        'entity_id': r.entity_id,
    } for r in rows])


@data_bp.route('/assignments', methods=['POST'])
@jwt_required()
def create_assignment():
    caller_id = get_jwt_identity()
    if not _is_admin(caller_id):
        return jsonify({'error': 'Admin access required'}), 403
    body = request.get_json(silent=True) or {}
    # Check for duplicate
    existing = UserEntityAssignment.query.filter_by(
        user_id=body.get('user_id'),
        corporate_id=body.get('corporate_id'),
        entity_id=body.get('entity_id') or None,
    ).first()
    if existing:
        return jsonify({'id': existing.id})
    a = UserEntityAssignment(
        user_id=body['user_id'],
        corporate_id=body['corporate_id'],
        entity_id=body.get('entity_id') or None,
    )
    db.session.add(a)
    db.session.commit()
    return jsonify({'id': a.id})


@data_bp.route('/assignments/<assignment_id>', methods=['DELETE'])
@jwt_required()
def delete_assignment(assignment_id):
    caller_id = get_jwt_identity()
    if not _is_admin(caller_id):
        return jsonify({'error': 'Admin access required'}), 403
    a = UserEntityAssignment.query.get(assignment_id)
    if not a:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(a)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Master Config: Lease Types
# ---------------------------------------------------------------------------

@data_bp.route('/lease-types', methods=['GET'])
@jwt_required()
def get_lease_types():
    rows = LeaseType.query.order_by(LeaseType.created_at).all()
    return jsonify([{'id': r.id, 'lease_type_name': r.lease_type_name, 'created_at': r.created_at} for r in rows])


@data_bp.route('/lease-types', methods=['POST'])
@jwt_required()
def save_lease_type():
    body = request.get_json(silent=True) or {}
    lid = body.get('id')
    name = (body.get('lease_type_name') or '').strip()
    if not name:
        return jsonify({'error': 'lease_type_name required'}), 400
    if lid:
        r = LeaseType.query.get(lid)
        if r:
            r.lease_type_name = name
        else:
            r = LeaseType(id=lid, lease_type_name=name)
            db.session.add(r)
    else:
        r = LeaseType(lease_type_name=name)
        db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})


@data_bp.route('/lease-types/<item_id>', methods=['PUT'])
@jwt_required()
def update_lease_type(item_id):
    body = request.get_json(silent=True) or {}
    r = LeaseType.query.get(item_id)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    r.lease_type_name = (body.get('lease_type_name') or '').strip()
    db.session.commit()
    return jsonify({'success': True})


@data_bp.route('/lease-types/<item_id>', methods=['DELETE'])
@jwt_required()
def delete_lease_type(item_id):
    r = LeaseType.query.get(item_id)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Master Config: Asset Locations
# ---------------------------------------------------------------------------

@data_bp.route('/asset-locations', methods=['GET'])
@jwt_required()
def get_asset_locations():
    rows = AssetLocation.query.order_by(AssetLocation.created_at).all()
    return jsonify([{'id': r.id, 'location_name': r.location_name, 'created_at': r.created_at} for r in rows])


@data_bp.route('/asset-locations', methods=['POST'])
@jwt_required()
def save_asset_location():
    body = request.get_json(silent=True) or {}
    lid = body.get('id')
    name = (body.get('location_name') or '').strip()
    if not name:
        return jsonify({'error': 'location_name required'}), 400
    if lid:
        r = AssetLocation.query.get(lid)
        if r:
            r.location_name = name
        else:
            r = AssetLocation(id=lid, location_name=name)
            db.session.add(r)
    else:
        r = AssetLocation(location_name=name)
        db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})


@data_bp.route('/asset-locations/<item_id>', methods=['PUT'])
@jwt_required()
def update_asset_location(item_id):
    body = request.get_json(silent=True) or {}
    r = AssetLocation.query.get(item_id)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    r.location_name = (body.get('location_name') or '').strip()
    db.session.commit()
    return jsonify({'success': True})


@data_bp.route('/asset-locations/<item_id>', methods=['DELETE'])
@jwt_required()
def delete_asset_location(item_id):
    r = AssetLocation.query.get(item_id)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Master Config: Workflow Roles
# ---------------------------------------------------------------------------

@data_bp.route('/workflow-roles', methods=['GET'])
@jwt_required()
def get_workflow_roles():
    rows = WorkflowRole.query.order_by(WorkflowRole.created_at).all()
    return jsonify([{'id': r.id, 'role_name': r.role_name, 'description': r.description or '', 'created_at': r.created_at} for r in rows])


@data_bp.route('/workflow-roles', methods=['POST'])
@jwt_required()
def save_workflow_role():
    body = request.get_json(silent=True) or {}
    rid = body.get('id')
    name = (body.get('role_name') or '').strip()
    desc = (body.get('description') or '').strip()
    if not name:
        return jsonify({'error': 'role_name required'}), 400
    if rid:
        r = WorkflowRole.query.get(rid)
        if r:
            r.role_name = name
            r.description = desc
        else:
            r = WorkflowRole(id=rid, role_name=name, description=desc)
            db.session.add(r)
    else:
        r = WorkflowRole(role_name=name, description=desc)
        db.session.add(r)
    db.session.commit()
    return jsonify({'id': r.id})


@data_bp.route('/workflow-roles/<item_id>', methods=['PUT'])
@jwt_required()
def update_workflow_role(item_id):
    body = request.get_json(silent=True) or {}
    r = WorkflowRole.query.get(item_id)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    r.role_name = (body.get('role_name') or '').strip()
    r.description = (body.get('description') or '').strip()
    db.session.commit()
    return jsonify({'success': True})


@data_bp.route('/workflow-roles/<item_id>', methods=['DELETE'])
@jwt_required()
def delete_workflow_role(item_id):
    r = WorkflowRole.query.get(item_id)
    if not r:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(r)
    db.session.commit()
    return jsonify({'success': True})


# ---------------------------------------------------------------------------
# Compute endpoints
# ---------------------------------------------------------------------------

@compute_bp.route('/lease', methods=['POST'])
@jwt_required()
def compute_lease_endpoint():
    """Compute a single lease and return LeaseComputation."""
    body = request.get_json(silent=True) or {}
    lease = body.get('lease')
    if not lease:
        return jsonify({'error': 'lease required'}), 400
    try:
        result = comp_engine.compute_lease(lease)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 422


@compute_bp.route('/journals', methods=['POST'])
@jwt_required()
def compute_journals_endpoint():
    """Generate journal entries for a lease."""
    body = request.get_json(silent=True) or {}
    lease = body.get('lease')
    computation = body.get('computation')
    if not lease:
        return jsonify({'error': 'lease required'}), 400
    try:
        if not computation:
            computation = comp_engine.compute_lease(lease)
        entries = comp_engine.generate_journal_entries(lease, computation)
        return jsonify(entries)
    except Exception as e:
        return jsonify({'error': str(e)}), 422


@compute_bp.route('/batch', methods=['POST'])
@jwt_required()
def compute_batch_endpoint():
    """Compute multiple leases at once. Returns { lease_id: { computation, journals } }"""
    body = request.get_json(silent=True) or {}
    leases = body.get('leases') or []
    results = {}
    for lease in leases:
        lid = lease.get('lease_id')
        try:
            computation = comp_engine.compute_lease(lease)
            journals = comp_engine.generate_journal_entries(lease, computation)
            results[lid] = {'computation': computation, 'journals': journals}
        except Exception as e:
            results[lid] = {'error': str(e)}
    return jsonify(results)


@compute_bp.route('/disclosures', methods=['POST'])
@jwt_required()
def compute_disclosures_endpoint():
    """Compute Ind AS 116 disclosures for a set of leases."""
    body = request.get_json(silent=True) or {}
    leases = body.get('leases') or []
    reporting_date = body.get('reporting_date')
    if not reporting_date:
        from datetime import date
        reporting_date = date.today().isoformat()
    try:
        result = comp_engine.compute_disclosures(leases, reporting_date)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 422


@compute_bp.route('/dashboard', methods=['GET'])
@jwt_required()
def compute_dashboard_endpoint():
    """Compute dashboard statistics."""
    from .app import CorporateGroup, Entity, Lease
    groups = CorporateGroup.query.all()
    entities = Entity.query.all()
    leases = Lease.query.all()

    active_leases = [l for l in leases if l.status == 'Active']
    total_liability = 0.0
    total_rou = 0.0

    for lease in active_leases:
        try:
            lease_dict = lease.to_dict()
            result = comp_engine.compute_lease(lease_dict)
            total_liability += result['initial_liability']
            total_rou += result['initial_rou']
        except Exception:
            pass

    return jsonify({
        'total_leases': len(leases),
        'active_leases': len(active_leases),
        'total_liability': comp_engine.round2(total_liability),
        'total_rou': comp_engine.round2(total_rou),
        'total_entities': len(entities),
        'total_groups': len(groups),
    })
