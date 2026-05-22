// School schedule — edit this file to add or change events by date.
// Shown on the student dashboard as a day-by-day list.

window.examScheduleConfig = {
    title: 'School schedule',
    subtitle: 'Important dates and sessions — one day at a time.',
    academicYearLabel: '2025–2026',

    // Add one object per exam. Sort order in the array = display order.
    exams: [
        {
            subject: 'English',
            subjectKey: 'english',
            date: '2026-06-02',
            startTime: '09:00',
            endTime: '11:00',
            room: 'Hall A',
            notes: 'Bring pens and student ID.'
        },
        {
            subject: 'Science',
            subjectKey: 'science',
            date: '2026-06-04',
            startTime: '09:00',
            endTime: '11:30',
            room: 'Lab Building — Room 3',
            notes: 'Calculator allowed where indicated on the paper.'
        },
        {
            subject: 'Social Studies',
            subjectKey: 'socialStudies',
            date: '2026-06-06',
            startTime: '09:00',
            endTime: '11:00',
            room: 'Hall B',
            notes: 'History & Geography combined paper.'
        }
    ]
};
