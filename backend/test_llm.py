from llm import get_teacher_llm

llm = get_teacher_llm()
print(llm.invoke("Say hi like a teacher.").content)
