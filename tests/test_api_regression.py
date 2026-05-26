import io
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / 'backend'
import sys
sys.path.insert(0, str(BACKEND_DIR))

TMPDIR = tempfile.TemporaryDirectory()
os.environ['DATABASE_URL'] = f"sqlite:///{Path(TMPDIR.name) / 'test_taskmanager.db'}"

import main  # noqa: E402
import models  # noqa: E402
from database import Base, engine, SessionLocal  # noqa: E402

Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
main.run_safe_migrations()
main.cleanup_priority_column_if_present()

client = TestClient(main.app)
PNG_BYTES = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
    b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0cIDATx\x9cc``\x00\x00\x00\x02\x00\x01'
    b'\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82'
)


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    main.run_safe_migrations()
    main.cleanup_priority_column_if_present()


def create_sprint(name='Sprint A'):
    response = client.post('/api/sprints', json={'name': name})
    assert response.status_code == 200
    return response.json()


def create_issue(**overrides):
    payload = {
        'title': 'Test issue',
        'description': 'Test description',
        'created_by': 'Jerry',
    }
    payload.update(overrides)
    response = client.post('/api/issues', json=payload)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture(autouse=True)
def _clean_db():
    reset_db()
    yield
    reset_db()


def test_login_rejects_unknown_user():
    response = client.post('/api/users/login', json={'username': 'Mallory'})
    assert response.status_code == 400
    assert 'Invalid username' in response.text


def test_create_issue_via_multipart_defaults_to_active_sprint():
    sprint = create_sprint()
    start = client.post(f"/api/sprints/{sprint['id']}/start")
    assert start.status_code == 200

    response = client.post(
        '/api/issues',
        data={
            'title': 'Multipart issue',
            'description': 'Created from form',
            'created_by': 'Jerry',
            'assigned_to': 'Aaron',
            'story_points': '5',
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body['sprint_id'] == sprint['id']
    assert body['assigned_to'] == 'Aaron'
    assert body['story_points'] == 5


def test_blocked_reason_sets_blocked_status_and_clearing_resets_to_todo():
    issue = create_issue(blocked_reason='Waiting on dependency')
    assert issue['status'] == 'blocked'

    updated = client.patch(f"/api/issues/{issue['id']}", json={'blocked_reason': None, 'updated_by': 'Jerry'})
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body['blocked_reason'] is None
    assert body['status'] == 'to_do'


def test_story_points_validation_rejects_out_of_range_values():
    response = client.post('/api/issues', json={
        'title': 'Bad estimate',
        'description': 'Too big',
        'created_by': 'Jerry',
        'story_points': 34,
    })
    assert response.status_code == 400
    assert 'story_points must be between 1 and 21' in response.text


def test_upload_image_accepts_real_png_and_rejects_fake_extension():
    issue = create_issue()

    ok = client.post(
        f"/api/issues/{issue['id']}/images?uploaded_by=Jerry",
        files={'file': ('tiny.png', io.BytesIO(PNG_BYTES), 'image/png')},
    )
    assert ok.status_code == 200, ok.text
    image = ok.json()
    assert image['source_type'] == 'issue'
    assert image['uploaded_by'] == 'Jerry'

    bad = client.post(
        f"/api/issues/{issue['id']}/images?uploaded_by=Jerry",
        files={'file': ('fake.png', io.BytesIO(b'not actually an image'), 'image/png')},
    )
    assert bad.status_code == 400
    assert 'Invalid image content' in bad.text


def test_comment_image_requires_matching_comment():
    issue = create_issue()
    response = client.post(
        f"/api/issues/{issue['id']}/images?uploaded_by=Jerry&source_type=comment&comment_id=9999",
        files={'file': ('tiny.png', io.BytesIO(PNG_BYTES), 'image/png')},
    )
    assert response.status_code == 404
    assert 'Comment not found for this issue' in response.text


def test_search_filters_and_issue_number_lookup_work():
    a = create_issue(title='Alpha feature', story_points=3, assigned_to='Jerry')
    b = create_issue(title='Beta review', story_points=8, assigned_to='Aaron')
    client.patch(f"/api/issues/{b['id']}", json={'status': 'in_review', 'updated_by': 'Jerry'})

    by_id = client.get(f"/api/issues/search?q=%23{a['id']}")
    assert by_id.status_code == 200
    assert [item['id'] for item in by_id.json()] == [a['id']]

    filtered = client.get('/api/issues/search?assigned_to=Aaron&needs_review=true&min_story_points=5')
    assert filtered.status_code == 200
    ids = [item['id'] for item in filtered.json()]
    assert ids == [b['id']]


def test_end_sprint_retains_issue_assignment():
    sprint = create_sprint('Historical Sprint')
    issue = create_issue(sprint_id=sprint['id'])

    response = client.post(f"/api/sprints/{sprint['id']}/end")
    assert response.status_code == 200
    assert response.json()['issues_retained'] == 1

    fetched = client.get(f"/api/issues/{issue['id']}")
    assert fetched.status_code == 200
    assert fetched.json()['sprint_id'] == sprint['id']


def test_branch_repo_slug_round_trip_and_activity_logging():
    issue = create_issue(branch='feature/x', repo_slug='aarwitz/lidi-solutions')
    updated = client.patch(
        f"/api/issues/{issue['id']}",
        json={'branch': 'feature/y', 'repo_slug': 'aarwitz/Task-Manager', 'updated_by': 'Jerry'},
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body['branch'] == 'feature/y'
    assert body['repo_slug'] == 'aarwitz/Task-Manager'
    fields = [event['field_name'] for event in body['activity_events'] if event['event_type'] == 'field_changed']
    assert 'branch' in fields
    assert 'repo_slug' in fields


def test_issue_detail_response_contains_expected_frontend_fields():
    sprint = create_sprint('UI Sprint')
    issue = create_issue(
        sprint_id=sprint['id'],
        assigned_to='Jerry',
        branch='feature/ui',
        repo_slug='aarwitz/Task-Manager',
        story_points=3,
        blocked_reason='Waiting on review',
        acceptance_criteria='It should render cleanly',
    )
    comment = client.post(
        f"/api/issues/{issue['id']}/comments",
        json={'content': 'Looks good', 'username': 'Aaron'},
    )
    assert comment.status_code == 200

    detail = client.get(f"/api/issues/{issue['id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert body['id'] == issue['id']
    assert body['assigned_to'] == 'Jerry'
    assert body['sprint_id'] == sprint['id']
    assert body['branch'] == 'feature/ui'
    assert body['repo_slug'] == 'aarwitz/Task-Manager'
    assert body['story_points'] == 3
    assert body['blocked_reason'] == 'Waiting on review'
    assert body['acceptance_criteria'] == 'It should render cleanly'
    assert isinstance(body['comments'], list) and len(body['comments']) == 1
    assert isinstance(body['images'], list)
    assert isinstance(body['activity_events'], list) and len(body['activity_events']) >= 1


def test_auto_launch_waits_when_assignee_already_has_active_launch(monkeypatch):
    monkeypatch.setattr(main, 'attempt_issue_auto_launch', lambda db, issue_id: None)

    first_issue = create_issue(
        title='Primary launch',
        description='First task for Jerry',
        created_by='Dwight',
        assigned_to='Jerry',
        branch='issue-201-primary-launch',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Primary task has clean readiness metadata',
        auto_launch_enabled=True,
    )
    first_update = client.patch(
        f"/api/issues/{first_issue['id']}",
        json={'status': 'in_progress', 'updated_by': 'Dwight'},
    )
    assert first_update.status_code == 200, first_update.text
    assert first_update.json()['launch_state'] == 'ready'

    launched = client.post(
        f"/api/issues/{first_issue['id']}/launch-result",
        json={'launch_state': 'launched', 'username': 'Dwight'},
    )
    assert launched.status_code == 200, launched.text
    assert launched.json()['launch_state'] == 'launched'

    second_issue = create_issue(
        title='Secondary launch',
        description='Second task for Jerry',
        created_by='Dwight',
        assigned_to='Jerry',
        branch='issue-202-secondary-launch',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Secondary task should wait for the first one',
        auto_launch_enabled=True,
    )
    second_update = client.patch(
        f"/api/issues/{second_issue['id']}",
        json={'status': 'in_progress', 'updated_by': 'Dwight'},
    )
    assert second_update.status_code == 200, second_update.text
    body = second_update.json()
    assert body['launch_state'] == 'waiting'
    assert body['launch_error'] == f"Jerry already has active auto-launch issue #{first_issue['id']}"


def test_launch_result_endpoint_records_state_error_comment_and_activity():
    issue = create_issue(
        title='Auto-launch target',
        description='Queue me',
        created_by='Dwight',
        assigned_to='Jerry',
        branch='issue-129-tm-exec-readiness-contract',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Launcher should post execution results back to TM',
        auto_launch_enabled=True,
    )

    response = client.post(
        f"/api/issues/{issue['id']}/launch-result",
        json={
            'launch_state': 'launched',
            'launch_error': None,
            'comment_content': '- changed: launcher execution began successfully.',
            'username': 'Dwight',
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['launch_state'] == 'launched'
    assert body['launch_error'] is None
    assert body['last_launch_at'] is not None
    assert any(comment['content'] == '- changed: launcher execution began successfully.' for comment in body['comments'])

    auto_launch_events = [event for event in body['activity_events'] if event['event_type'] == 'auto_launch']
    assert any(event['field_name'] == 'launch_state' and event['new_value'] == 'launched' for event in auto_launch_events)


def test_launch_result_endpoint_rejects_invalid_state():
    issue = create_issue()
    response = client.post(
        f"/api/issues/{issue['id']}/launch-result",
        json={'launch_state': 'not-a-real-state', 'username': 'Dwight'},
    )
    assert response.status_code == 400
    assert 'Invalid launch_state' in response.text


def test_operator_view_ready_not_queued_filters_to_ready_auto_launch_issues(monkeypatch):
    monkeypatch.setattr(main, 'attempt_issue_auto_launch', lambda db, issue_id: None)

    ready_issue = create_issue(
        title='Ready issue',
        created_by='Dwight',
        assigned_to='Dwight',
        branch='issue-301-ready',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Ready issue should appear in operator view',
        auto_launch_enabled=True,
    )
    ready_update = client.patch(
        f"/api/issues/{ready_issue['id']}",
        json={'status': 'in_progress', 'updated_by': 'Dwight'},
    )
    assert ready_update.status_code == 200, ready_update.text
    assert ready_update.json()['launch_state'] == 'ready'

    queued_issue = create_issue(
        title='Queued issue',
        created_by='Dwight',
        assigned_to='Jerry',
        branch='issue-302-queued',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Queued issue should not appear in ready view',
        auto_launch_enabled=True,
    )
    queued_update = client.patch(
        f"/api/issues/{queued_issue['id']}",
        json={'status': 'in_progress', 'updated_by': 'Dwight'},
    )
    assert queued_update.status_code == 200, queued_update.text
    launched = client.post(
        f"/api/issues/{queued_issue['id']}/launch-result",
        json={'launch_state': 'queued', 'username': 'Dwight'},
    )
    assert launched.status_code == 200, launched.text

    response = client.get('/api/issues/search?operator_view=ready_not_queued')
    assert response.status_code == 200, response.text
    ids = [item['id'] for item in response.json()]
    assert ready_issue['id'] in ids
    assert queued_issue['id'] not in ids


def test_operator_view_active_launch_without_recent_evidence_filters_old_active_runs():
    issue = create_issue(
        title='Old launched issue',
        created_by='Dwight',
        assigned_to='Jerry',
        branch='issue-303-old-launch',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Launched issue should need recent evidence',
        auto_launch_enabled=True,
    )
    launched = client.post(
        f"/api/issues/{issue['id']}/launch-result",
        json={'launch_state': 'launched', 'username': 'Dwight'},
    )
    assert launched.status_code == 200, launched.text

    db = SessionLocal()
    try:
        db_issue = db.query(models.Issue).filter(models.Issue.id == issue['id']).first()
        db_issue.last_launch_at = datetime.now() - timedelta(days=3)
        for comment in db_issue.comments:
            comment.created_at = datetime.now() - timedelta(days=3)
        db.commit()
    finally:
        db.close()

    response = client.get('/api/issues/search?operator_view=active_launch_without_recent_evidence&evidence_window_days=1')
    assert response.status_code == 200, response.text
    ids = [item['id'] for item in response.json()]
    assert issue['id'] in ids


def test_operator_view_in_progress_no_pr_filters_code_work_missing_pr_evidence():
    no_pr_issue = create_issue(
        title='Missing PR issue',
        created_by='Dwight',
        assigned_to='Dwight',
        branch='issue-304-no-pr',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Should show when no PR evidence exists',
    )
    no_pr_update = client.patch(
        f"/api/issues/{no_pr_issue['id']}",
        json={'status': 'in_progress', 'updated_by': 'Dwight'},
    )
    assert no_pr_update.status_code == 200, no_pr_update.text

    has_pr_issue = create_issue(
        title='Has PR issue',
        created_by='Dwight',
        assigned_to='Dwight',
        branch='issue-305-has-pr',
        repo_slug='aarwitz/Task-Manager',
        acceptance_criteria='Should not show when PR evidence exists',
    )
    has_pr_update = client.patch(
        f"/api/issues/{has_pr_issue['id']}",
        json={'status': 'in_progress', 'updated_by': 'Dwight'},
    )
    assert has_pr_update.status_code == 200, has_pr_update.text
    pr_comment = client.post(
        f"/api/issues/{has_pr_issue['id']}/comments",
        json={'content': '- evidence: branch=issue-305-has-pr pr_status=opened pr_url=https://github.com/example/repo/pull/305', 'username': 'Dwight'},
    )
    assert pr_comment.status_code == 200, pr_comment.text

    response = client.get('/api/issues/search?operator_view=in_progress_no_pr')
    assert response.status_code == 200, response.text
    ids = [item['id'] for item in response.json()]
    assert no_pr_issue['id'] in ids
    assert has_pr_issue['id'] not in ids
