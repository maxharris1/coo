create unique index jobs_one_running_per_offer on jobs (user_id, job_id) where status = 'running';
