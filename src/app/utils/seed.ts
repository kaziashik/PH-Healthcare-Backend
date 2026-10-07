import bcrypt from "bcryptjs";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import config from "../config";

export const seedSuperAdmon = async () => {
  try {
    const isSuperAdmonExist = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });

    if (isSuperAdmonExist) {
      await prisma.admin.upsert({
        where: { userId: isSuperAdmonExist.id },
        update: {},
        create: {
          name: isSuperAdmonExist.name,
          organizationEmail: isSuperAdmonExist.email,
          personalEmail: isSuperAdmonExist.email,
          userId: isSuperAdmonExist.id,
        },
      });
      console.log("Super Admin Exists!");
      return
    }

    const name = config.super_admin_name;
    const email = config.super_admin_email;
    const password = config.super_admin_password;

    if(!name || !email || !password){
        throw new Error ("super Admin Name, Email, Password missiong in Env File!!")
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        needPasswordChange: false,
        emailVerified: true,
        admin: {
          create: {
            name,
            organizationEmail: email,
            personalEmail: email,
          },
        },
      },
    });

    console.log("super admin Created: ", superAdmin);
  } catch (error) {
    console.log("Error seeding super Admin: ", error);

    await prisma.user.delete({
        where: {
            email: config.super_admin_email
        }
    })
  }
};




//create tester admin 

export const seedTesterAdmin = async () => {
    try {
        const isTesterAdminExist = await prisma.user.findUnique({
            where: {
                email : config.tester_admin_email
            }
        });

        if (isTesterAdminExist) {
            await prisma.admin.upsert({
                where: { userId: isTesterAdminExist.id },
                update: {},
                create: {
                    name: isTesterAdminExist.name,
                    organizationEmail: isTesterAdminExist.email,
                    personalEmail: isTesterAdminExist.email,
                    userId: isTesterAdminExist.id,
                },
            });
            console.log("Tester Admin Already Exists!");
            return;
        }

        const name = config.tester_admin_name
        const email = config.tester_admin_email
        const password = config.tester_admin_password

        if (!name || !email || !password) {
            throw new Error("Tester Admin Name , Email, Password Missing In Env File!!!")
        }

        const hashedPassword = await bcrypt.hash(password, Number(config.bcrypt_salt_rounds))

        const testerAdmin = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: Role.ADMIN,
                needPasswordChange: false,
                emailVerified: true,
                admin: {
                    create: {
                        name,
                        organizationEmail: email,
                        personalEmail: email,
                    },
                },
            }
        })

        console.log("Tester Admin Created : ", testerAdmin);



    } catch (error) {

        console.log("Error Seeding Tester Admin : ", error);

        await prisma.user.delete({
            where: {
                email: config.tester_admin_email
            }
        })


    }
}


// create tester doctor

export const seedTesterDoctor = async () => {
    try {
        const isTesterDoctorExist = await prisma.user.findUnique({
            where: {
                email : config.tester_doctor_email
            }
        });

        if (isTesterDoctorExist) {
            const doctorProfile = await prisma.doctor.findUnique({
                where: { userId: isTesterDoctorExist.id },
            });

            if (!doctorProfile) {
                await prisma.doctor.create({
                    data: {
                        name: isTesterDoctorExist.name,
                        email: isTesterDoctorExist.email,
                        specialization: "General Medicine",
                        licenseNumber: "SEED-TEST-DOCTOR",
                        qualifications: "MBBS",
                        experienceYears: 1,
                        verificationStatus: DoctorVerificationStatus.APPROVED,
                        userId: isTesterDoctorExist.id,
                    },
                });
            }

            console.log("Tester Doctor Already Exists!");
            return;
        }

        const name = config.tester_doctor_name
        const email = config.tester_doctor_email
        const password = config.tester_doctor_password

        if (!name || !email || !password) {
            throw new Error("Tester Doctor Name , Email, Password Missing In Env File!!!")
        }

        const hashedPassword = await bcrypt.hash(password, Number(config.bcrypt_salt_rounds))

        const testerDoctor = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: Role.DOCTOR,
                needPasswordChange: false,
                emailVerified: true,
                doctor: {
                    create: {
                        name,
                        email,
                        specialization: "General Medicine",
                        licenseNumber: "SEED-TEST-DOCTOR",
                        qualifications: "MBBS",
                        experienceYears: 1,
                        verificationStatus: DoctorVerificationStatus.APPROVED,
                    },
                },
            }
        })

        console.log("Tester Doctor Created : ",testerDoctor);



    } catch (error) {

        console.log("Error Seeding Tester Doctor : ", error);

        await prisma.user.delete({
            where: {
                email: config.tester_doctor_email
            }
        })


    }
}
