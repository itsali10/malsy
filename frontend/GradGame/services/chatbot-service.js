window.chatbotService = {
    getWelcomeMessage(studentName) {
        return `Hi ${studentName}! I am your study chatbot. Ask me about subjects, progress, or what to do next.`;
    },

    respond(userMessage, student) {
        const message = userMessage.toLowerCase();

        if (this.containsAny(message, ['hello', 'hi', 'hey'])) {
            return `Hello ${student.name}! What would you like to learn today?`;
        }

        if (this.containsAny(message, ['progress', 'how am i doing', 'status'])) {
            const english = progressService.getProgressPercent(student, 'english');
            const science = progressService.getProgressPercent(student, 'science');
            const social = progressService.getProgressPercent(student, 'socialStudies');
            return `Your current progress is English ${english}%, Science ${science}%, and Social Studies ${social}%.`;
        }

        if (this.containsAny(message, ['english'])) {
            return 'English has 9 lessons unlocked sequentially. Complete each lesson to open the next one.';
        }

        if (this.containsAny(message, ['science', 'chemistry'])) {
            return 'Science has 9 lessons and a chemistry lab section. You can open the lab from the Science subject page.';
        }

        if (this.containsAny(message, ['social', 'history', 'geography'])) {
            return 'Social Studies is split into History and Geography. Each section has lessons and reserved video slots.';
        }

        if (this.containsAny(message, ['game', 'hangman', 'spelling'])) {
            return 'Use the Educational Games card to play Hangman and Spelling Bee.';
        }

        if (this.containsAny(message, ['next', 'what should i do'])) {
            return this.getNextStep(student);
        }

        if (this.containsAny(message, ['avatar', 'unity'])) {
            return 'The left panel is reserved for your Unity avatar build. You can embed your Unity output there.';
        }

        return 'I can help with progress, subject guidance, games, and Unity sections. Try asking: "What should I do next?"';
    },

    getNextStep(student) {
        const englishNext = this.nextLessonNumber(student.progress.english.completedLessons, student.progress.english.totalLessons);
        if (englishNext) {
            return `A good next step is English Lesson ${englishNext}.`;
        }

        const scienceNext = this.nextLessonNumber(student.progress.science.completedLessons, student.progress.science.totalLessons);
        if (scienceNext) {
            return `Great progress! Continue with Science Lesson ${scienceNext}.`;
        }

        return 'You are doing great. Continue with Social Studies lessons or review the chemistry lab.';
    },

    nextLessonNumber(completedLessons, totalLessons) {
        for (let lesson = 1; lesson <= totalLessons; lesson += 1) {
            if (!completedLessons.includes(lesson)) {
                return lesson;
            }
        }
        return null;
    },

    containsAny(message, terms) {
        return terms.some((term) => message.includes(term));
    }
};
